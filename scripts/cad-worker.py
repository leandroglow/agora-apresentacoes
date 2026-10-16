#!/usr/bin/env python3
import argparse,base64,json,os,shutil,subprocess,tempfile,time,uuid,sys
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.parse import urljoin, urlparse
MAX_BYTES=10*1024*1024
MAX_OUTPUT_BYTES=10*1024*1024
class WorkerError(RuntimeError): pass
def cfg():
 a=os.environ.get("CAD_API_URL","").rstrip("/"); t=os.environ.get("CAD_WORKER_TOKEN","")
 if not a or not t: raise WorkerError("CAD_API_URL e CAD_WORKER_TOKEN são obrigatórios")
 libs=os.environ.get("CAD_LIBS","")
 if libs and libs not in sys.path: sys.path.insert(0,libs)
 return {"api":a,"token":t,"oda":Path(os.environ.get("CAD_ODA","")),"poll":float(os.environ.get("CAD_WORKER_POLL_SECONDS","10")),"timeout":float(os.environ.get("CAD_WORKER_TIMEOUT_SECONDS","300"))}
def js(url,t,method="GET",body=None):
 d=json.dumps(body).encode() if body is not None else None
 with urlopen(Request(url,data=d,method=method,headers={"x-cad-worker-token":t,"Accept":"application/json","Content-Type":"application/json"}),timeout=60) as r: return json.loads(r.read(2*1024*1024))
def download(url,t,p):
 offset=0
 with p.open("wb") as output:
  while True:
   part_url=url+("&" if "?" in url else "?")+"offset="+str(offset)
   with urlopen(Request(part_url,headers={"x-cad-worker-token":t}),timeout=60) as response:
    content_range=response.headers.get("Content-Range","")
    import re
    match=re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)",content_range)
    if not match: raise WorkerError("Resposta parcial ausente")
    start,end,total=map(int,match.groups())
    if start!=offset or total>MAX_BYTES or end<start: raise WorkerError("Parte inválida")
    data=response.read(2*1024*1024+1)
    if len(data)>2*1024*1024 or len(data)!=end-start+1: raise WorkerError("Parte incompleta")
    output.write(data); offset=end+1
    if offset==total:return
def convert(src,out,ext,target,c):
 if target=="pdf" and ext=="pdf":
  try:
   import fitz
   d=fitz.open(str(src))
   if d.page_count<1: raise WorkerError("PDF sem páginas")
   d.close()
  except ImportError as e: raise WorkerError("PyMuPDF não instalado") from e
  dst=out/"converted.pdf"; shutil.copyfile(src,dst); return dst
 if not c["oda"].is_file(): raise WorkerError("CAD_ODA inválido")
 if target not in {"pdf","dxf","dwg"}: raise WorkerError("format deve ser pdf, dxf ou dwg")
 source=src
 if ext=="dwg" and target=="pdf":
  dxfdir=out/"oda-dxf"; dxfdir.mkdir()
  subprocess.run([str(c["oda"]),str(src.parent),str(dxfdir),"ACAD2018","DXF","0","0",src.name],check=True,timeout=c["timeout"],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
  xs=list(dxfdir.glob("*.dxf"))
  if len(xs)!=1: raise WorkerError(f"ODA produziu {len(xs)} DXFs")
  source=xs[0]; ext="dxf"
 if target in {"dxf","dwg"}:
  od=out/("oda-"+target); od.mkdir()
  subprocess.run([str(c["oda"]),str(src.parent),str(od),"ACAD2018",target.upper(),"0","0",src.name],check=True,timeout=c["timeout"],stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
  xs=list(od.glob("*."+target))
  if len(xs)!=1: raise WorkerError(f"ODA produziu {len(xs)} {target.upper()}s")
  dst=out/("converted."+target); shutil.copyfile(xs[0],dst); return dst
 try:
  import ezdxf,pymupdf
  from ezdxf.addons.drawing import Frontend,RenderContext,layout,config
  from ezdxf.addons.drawing.pymupdf import PyMuPdfBackend
  doc=ezdxf.readfile(str(source)); backend=PyMuPdfBackend()
  Frontend(RenderContext(doc),backend,config=config.Configuration(background_policy=config.BackgroundPolicy.WHITE)).draw_layout(doc.layouts.get("Model"),finalize=True)
  result=pymupdf.open(); result.insert_pdf(pymupdf.open(stream=backend.get_pdf_bytes(layout.Page(594,841,margins=layout.Margins.all(10))),filetype="pdf")); dst=out/"converted.pdf"; result.save(str(dst)); result.close(); return dst
 except ImportError as e: raise WorkerError("CAD_LIBS sem ezdxf/PyMuPDF") from e
def post(c,i,status,error=None,out=None,lease=None):
 b={"id":i,"status":status}
 if lease: b["leaseToken"]=lease
 if error: b["error"]=str(error)[:4000]
 if out:
  d=out.read_bytes()
  if not d or len(d)>MAX_OUTPUT_BYTES: raise WorkerError("saída vazia ou maior que 3 MB")
  if len(d)>3*1024*1024:
   chunks=[d[n:n+2*1024*1024] for n in range(0,len(d),2*1024*1024)]
   for index,chunk in enumerate(chunks):
    js(c["api"]+"/api/cad-worker",c["token"],"POST",{"id":i,"leaseToken":lease,"status":"chunk","index":index,"total":len(chunks),"dataBase64":base64.b64encode(chunk).decode()})
   b.update(chunks=len(chunks),name=out.name)
  else:b.update(dataBase64=base64.b64encode(d).decode(),name=out.name)
 js(c["api"]+"/api/cad-worker",c["token"],"POST",b)
def job(j,c):
 i=str(j.get("id","")); name=Path(str(j.get("inputName",""))).name; ext=Path(name).suffix.lower().lstrip("."); target=str(j.get("format","")).lower().lstrip(".")
 lease=str(j.get("leaseToken",""))
 if not i or not lease or not j.get("downloadUrl") or ext not in {"dwg","dxf","pdf"} or target not in {"pdf","dxf","dwg"}: raise WorkerError("trabalho inválido")
 with tempfile.TemporaryDirectory(prefix="cad-worker-"+uuid.uuid4().hex+"-") as z:
  url=urljoin(c["api"]+"/",j["downloadUrl"])
  origin=urlparse(c["api"]); dest=urlparse(url)
  if dest.scheme!="https" or (dest.scheme,dest.netloc)!=(origin.scheme,origin.netloc): raise WorkerError("URL de download fora da API")
  w=Path(z); s=w/("input."+ext); download(url,c["token"],s)
  converted=convert(s,w,ext,target,c)
  for attempt in range(3):
   try:
    post(c,i,"completed",out=converted,lease=lease); break
   except Exception:
    if attempt==2: raise
    time.sleep(3)
def run(c,once=False):
 while 1:
  try: j=js(c["api"]+"/api/cad-worker",c["token"]).get("job")
  except Exception:
   if once: raise
   time.sleep(c["poll"]); continue
  if j is None:
   if once:return
   time.sleep(c["poll"]);continue
  try:job(j,c)
  except Exception as e:
   try:post(c,str(j.get("id","")),"failed",error=e,lease=j.get("leaseToken"))
   except Exception:pass
  if once:return
if __name__=="__main__":
 p=argparse.ArgumentParser();p.add_argument("--once",action="store_true");a=p.parse_args()
 try:run(cfg(),a.once)
 except WorkerError as e:print("cad-worker:",e);raise SystemExit(2)

