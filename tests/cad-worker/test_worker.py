import importlib.util,os,tempfile,unittest
from pathlib import Path
p=Path(__file__).parents[2]/"scripts"/"cad-worker.py"
s=importlib.util.spec_from_file_location("cad_worker",p); w=importlib.util.module_from_spec(s); s.loader.exec_module(w)
class T(unittest.TestCase):
 def test_extension_and_limit(self):
  self.assertEqual(w.Path("x.DWG").suffix.lower().lstrip("."),"dwg")
  self.assertGreater(w.MAX_BYTES,0)
  self.assertEqual(w.MAX_OUTPUT_BYTES,10*1024*1024)
 def test_config_requires_env(self):
  old={k:os.environ.pop(k,None) for k in ("CAD_API_URL","CAD_WORKER_TOKEN")}
  try:
   with self.assertRaises(w.WorkerError): w.cfg()
  finally:
   for k,v in old.items():
    if v is not None: os.environ[k]=v
if __name__=="__main__":unittest.main()

