"""Registro restrito de presenças Telegram, sem cálculo financeiro."""
from __future__ import annotations
import copy, hashlib, json, re, tempfile, unicodedata
from datetime import date
from pathlib import Path
from . import registro_rh

SHIFTS={"manha":.5,"tarde":.5,"dia":1.0}
_KNOWN={"event","date","shift","people","project","activity"}
def _bad(m): raise ValueError(m)
def _fold(v): return "".join(c for c in unicodedata.normalize("NFKD",v.casefold()) if not unicodedata.combining(c))
def _parse(p):
    if not isinstance(p,dict) or set(p)!=_KNOWN: _bad("payload deve conter exatamente os campos conhecidos")
    event,day,shift,people=p["event"],p["date"],p["shift"],p["people"]
    if not isinstance(event,str) or not re.fullmatch(r"telegram:[0-9]+",event) or len(event)>80: _bad("event inválido")
    if not isinstance(day,str) or len(day)!=10:
        _bad("date inválida")
    try: date.fromisoformat(day)
    except ValueError: _bad("date inválida")
    if not isinstance(shift, str) or shift not in SHIFTS: _bad("Turno inválido.")
    if not isinstance(people,list) or not 1<=len(people)<=100 or any(not isinstance(x,str) or not 1<=len(x.strip())<=120 for x in people): _bad("people inválido")
    names=[x.strip() for x in people]
    if len({_fold(x) for x in names})!=len(names): _bad("pessoas repetidas")
    project,activity=p["project"],p["activity"]
    if not isinstance(project,str) or (project and not re.fullmatch(r"[0-9]{1,10}",project)) or not isinstance(activity,str) or len(activity)>240: _bad("Informe uma obra numérica e atividade de até 240 caracteres.")
    return event,day,shift,names,project.strip(),activity.strip()
def _people(f):
    if not isinstance(f,dict) or not isinstance(f.get("groups"),list): _bad("forecast.groups inválido")
    out={}
    for g in f["groups"]:
        if not isinstance(g,dict) or not isinstance(g.get("people"),list): _bad("forecast.people inválido")
        for p in g["people"]:
            if not isinstance(p,dict) or not isinstance(p.get("id"),str) or not p["id"].strip() or not isinstance(p.get("name"),str) or not p["name"].strip(): _bad("pessoa do forecast inválida")
            k=_fold(p["name"].strip()); ident=p["id"].strip()
            if k in out and out[k]!=ident: _bad("nome ambíguo no forecast")
            out[k]=ident
    return out
def _aid(pid,day,shift): return "attendance:"+hashlib.sha256(f"{pid}\0{day}\0{shift}".encode()).hexdigest()[:24]
def _same(f,pid,day,shift,project,activity): return f.get("personId")==pid and f.get("date")==day and f.get("type")=="attendance" and f.get("shift")==shift and f.get("days")==SHIFTS[shift] and f.get("projectId","")==project and f.get("activity","")==activity and f.get("status")!="cancelled"
def _plan(ledger,forecast,payload):
    event,day,shift,names,project,activity=_parse(payload); ids=_people(forecast); resolved=[ids.get(_fold(n)) for n in names]
    if any(not x for x in resolved): _bad("Nome não encontrado no cadastro do RH. Use o nome como aparece em Equipe e RH.")
    if len(set(resolved)) != len(resolved): _bad("A lista contém duas referências à mesma pessoa.")
    facts=ledger.get("ocorrencias",[]); ef=[f for f in facts if f.get("source")==event]; expected=[(_aid(pid,day,shift),pid) for pid in resolved]
    if ef:
        if len(ef)!=len(expected) or any(not any(f.get("id")==fid and _same(f,pid,day,shift,project,activity) for f in ef) for fid,pid in expected): _bad("replay contraditório ou incompleto")
        return event,day,shift,project,activity,resolved,True
    equivalent = []
    for pid in resolved:
        found_equivalent = False
        for f in facts:
            if f.get("personId")!=pid or f.get("date")!=day: continue
            if f.get("status")=="cancelled":
                if f.get("id")==_aid(pid,day,shift): _bad("Há uma presença cancelada para esse turno. Confira o histórico antes de relançar.")
                continue
            if f.get("type") in {"absence","extra"}: _bad("fato absence/extra conflitante")
            if f.get("type")!="attendance": continue
            old=f.get("shift")
            if old not in SHIFTS or old==shift or old=="dia" or shift=="dia":
                if f.get("status") in ("reported","confirmed") and _same(f,pid,day,shift,project,activity):
                    found_equivalent = True
                    continue
                _bad("presença contraditória ou sobreposta")
        equivalent.append(found_equivalent)
    if any(equivalent):
        if not all(equivalent):
            _bad("sobreposição parcial: reenvie somente os faltantes ou adicione apenas os pendentes com replay seguro")
        return event,day,shift,project,activity,resolved,True
    return event,day,shift,project,activity,resolved,False
def preview_attendance(ledger,forecast,payload):
    plan=_plan(registro_rh.normalize(copy.deepcopy(ledger)),forecast,payload); return {"status":"existing" if plan[-1] else "recorded","count":len(plan[5])}
def apply_attendance(ledger,forecast,payload):
    normalized=registro_rh.normalize(copy.deepcopy(ledger)); event,day,shift,project,activity,resolved,existing=_plan(normalized,forecast,payload)
    if existing: return ledger,{"status":"existing","count":len(resolved)}
    with tempfile.TemporaryDirectory(prefix="rh-gateway-") as tmp:
        path=Path(tmp)/"ledger.json"; path.write_text(json.dumps(normalized,ensure_ascii=False,indent=2)+"\n",encoding="utf-8"); revision=normalized["revision"]
        for pid in resolved:
            rec={"id":_aid(pid,day,shift),"personId":pid,"date":day,"type":"attendance","days":SHIFTS[shift],"shift":shift,"status":"reported","source":event,"projectId":project,"activity":activity}
            revision=registro_rh.register(path,"ocorrencias",rec,event,revision)["revision"]
        result=registro_rh.normalize(json.loads(path.read_text(encoding="utf-8")))
    return result,{"status":"recorded","count":len(resolved)}
