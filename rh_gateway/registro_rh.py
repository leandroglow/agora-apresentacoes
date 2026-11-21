"""Registro único RH. Correções preservam snapshots; não elimina eventos.

Escrita no arquivo existente preserva sua identidade no DriveFS. Reserva central
e lock local são obrigatórios; não oferecem transação entre vários computadores.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import json
import math
import os
import re
from datetime import date, datetime
from pathlib import Path

COLLECTIONS = ('compensacoes', 'adiantamentos', 'pagamentos', 'ocorrencias')
OCC_TYPES = {'absence', 'extra', 'attendance', 'allocation', 'note'}
STATUSES = {'reported', 'confirmed', 'planned', 'cancelled'}

def now(): return datetime.now().astimezone().isoformat(timespec='seconds')
def nonempty(v): return isinstance(v, str) and bool(v.strip())
def finite(v): return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
def iso(v):
    if not isinstance(v, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', v): raise ValueError('data ISO obrigatória')
    date.fromisoformat(v)
def digest(raw): return hashlib.sha256(raw).hexdigest()
def decode(raw):
    def reject(v): raise ValueError('número JSON inválido: '+v)
    return json.loads(raw.decode('utf-8-sig'), parse_constant=reject)
def validate(c, x):
    if c not in COLLECTIONS or not isinstance(x, dict) or not nonempty(x.get('id')): raise ValueError('coleção/id inválido')
    if not any(nonempty(x.get(k)) for k in ('source','fonte','origem')): raise ValueError('fonte obrigatória')
    if c == 'ocorrencias':
        if not nonempty(x.get('personId')) or not nonempty(x.get('source')): raise ValueError('pessoa/fonte obrigatória')
        iso(x.get('date'))
        if x.get('type') not in OCC_TYPES or x.get('status') not in STATUSES: raise ValueError('tipo/estado inválido')
        if not finite(x.get('days')) or x['days'] < 0: raise ValueError('dias inválidos')
        if x['type'] in ('absence','extra') and x['days'] != 1: raise ValueError('falta/extra exige evento diário de 1 dia')
    else:
        if not nonempty(x.get('pessoa_id')) or not finite(x.get('valor')) or x['valor'] < 0: raise ValueError('pessoa/valor inválido')
        iso(x.get('data') if c == 'pagamentos' else x.get('pagamento'))
        if c == 'pagamentos' and x.get('status') not in STATUSES: raise ValueError('estado do pagamento obrigatório')
        for k in ('liquidada','confirmada','aplicar_na_previsao','transferencia_comprovada'):
            if k in x and not isinstance(x[k],bool): raise ValueError('estado booleano inválido')

def normalize(d):
    if not isinstance(d,dict): raise ValueError('ledger inválido')
    d.setdefault('revision',0)
    if type(d['revision']) is not int or d['revision'] < 0: raise ValueError('revisão inválida')
    identities=set()
    for c in COLLECTIONS:
        d.setdefault(c,[])
        if not isinstance(d[c],list): raise ValueError('coleção inválida')
        for x in d[c]:
            validate(c,x)
            if x['id'] in identities: raise ValueError('ID duplicado no ledger')
            identities.add(x['id'])
    d.setdefault('historico_registros',[])
    if not isinstance(d['historico_registros'],list): raise ValueError('histórico inválido')
    latest={}
    for h in d['historico_registros']:
        if not isinstance(h,dict) or h.get('collection') not in COLLECTIONS or not isinstance(h.get('data'),dict): raise ValueError('revisão histórica inválida')
        latest[(h['collection'],h['id'])]=h['data']
    # Detect edits outside this workflow once the audit baseline exists.
    if latest:
        current={(c,x['id']):x for c in COLLECTIONS for x in d[c]}
        if current != latest: raise ValueError('registro alterado fora do histórico; reconciliar antes de gravar')
    return d

def load(p): return normalize(decode(Path(p).read_bytes()))

def write_verified(p, original, payload):
    if digest(p.read_bytes()) != digest(original): raise RuntimeError('ledger mudou durante a leitura')
    # Keep a durable recovery copy, never an alternative live source.
    recovery=p.with_suffix(p.suffix+'.recovery')
    with recovery.open('wb') as f: f.write(original); f.flush(); os.fsync(f.fileno())
    if recovery.read_bytes() != original: raise IOError('cópia de recuperação divergente')
    if p.read_bytes() != original: raise RuntimeError('ledger mudou antes da gravação')
    try:
        with p.open('r+b') as f: f.write(payload); f.truncate(); f.flush(); os.fsync(f.fileno())
        if p.read_bytes() != payload: raise IOError('releitura integral divergente')
    except Exception:
        with p.open('wb') as f: f.write(original); f.flush(); os.fsync(f.fileno())
        raise

def register(p, c, x, source, expected=None):
    p=Path(p)
    if c not in COLLECTIONS or not isinstance(x,dict) or not nonempty(x.get('id')): raise ValueError('coleção/id inválido')
    if not nonempty(source): raise ValueError('fonte da alteração obrigatória')
    if type(expected) is not int or expected < 0: raise ValueError('revisão esperada obrigatória')
    if not p.is_file(): raise FileNotFoundError('ledger inexistente; não criar outra fonte silenciosamente')
    lock=p.with_suffix(p.suffix+'.lock')
    try: fd=os.open(lock,os.O_CREAT|os.O_EXCL|os.O_WRONLY)
    except FileExistsError: raise RuntimeError('registro ocupado; consultar reserva central')
    try:
        original=p.read_bytes(); d=normalize(decode(original)); rev=d['revision']
        if rev != expected: raise RuntimeError(f'revisão stale: atual={rev}, esperada={expected}')
        old=next((z for z in d[c] if z['id']==x['id']),None)
        merged={**copy.deepcopy(old or {}),**copy.deepcopy(x)}
        validate(c,merged)
        if old == merged: return {'changed':False,'revision':rev,'id':x['id']}
        if any(z['id']==x['id'] for k in COLLECTIONS if k!=c for z in d[k]): raise ValueError('ID já existe em outra coleção')
        stamp=now()
        if not d['historico_registros']:
            for k in COLLECTIONS:
                for z in d[k]: d['historico_registros'].append({'collection':k,'id':z['id'],'revision':rev,'recorded_at':stamp,'source':'Base preservada antes da primeira alteração auditada','previous':None,'data':copy.deepcopy(z)})
        if c=='ocorrencias':
            merged.setdefault('recordedAt',stamp)
        d[c]=[merged if z['id']==x['id'] else z for z in d[c]] if old else d[c]+[merged]
        d['historico_registros'].append({'collection':c,'id':x['id'],'revision':rev+1,'recorded_at':stamp,'source':source,'previous':copy.deepcopy(old),'data':copy.deepcopy(merged)})
        comp=sum(z['valor'] for z in d['compensacoes'] if z.get('confirmada') is True and z.get('liquidada') is not True)
        adv=sum(z['valor'] for z in d['adiantamentos'] if (z.get('aplicar_na_previsao') is True or z.get('transferencia_comprovada') is True) and z.get('liquidada') is not True)
        d.update(revision=rev+1,atualizado_em=stamp[:10],updated_at=stamp,total_compensacoes_abertas=round(comp,2),total_adiantamentos_previstos=round(adv,2),total_aberto=round(comp+adv,2))
        normalize(d)
        payload=(json.dumps(d,ensure_ascii=False,indent=2,allow_nan=False)+'\n').encode('utf-8')
        write_verified(p,original,payload)
        return {'changed':True,'revision':rev+1,'id':x['id'],'sha256':digest(payload)}
    finally:
        os.close(fd); lock.unlink()

def main():
    a=argparse.ArgumentParser(description=__doc__)
    a.add_argument('--collection',required=True,choices=COLLECTIONS);a.add_argument('--input',required=True)
    a.add_argument('--expected-revision',type=int,required=True);a.add_argument('--source',required=True)
    a.add_argument('--ledger',default=str(Path(__file__).with_name('compensacoes-abertas.json')))
    z=a.parse_args()
    print(json.dumps(register(Path(z.ledger),z.collection,decode(Path(z.input).read_bytes()),z.source,z.expected_revision),ensure_ascii=False))
if __name__=='__main__': main()
