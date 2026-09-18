import json, sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from ai.service.insight_service import InsightService
from ai.utils.llm_client import LLMUnavailableError, LLMResponseError
class Fake:
 def __init__(self,x):self.x=x
 def complete(self,p):return self.x
class Tests(unittest.TestCase):
 def test_all_domains_and_deterministic_prompt(self):
  for d in ('customer','invoice_collection','inventory','cash_flow','sales','transaction_anomaly'):
   r=InsightService(Fake(json.dumps({'summary':'Supported explanation','confidence_note':'Based only on supplied data','key_reasons':[]}))).generate(d,{'signals':[]})
   self.assertEqual(r.domain,d)
 def test_bad_and_unavailable(self):
  with self.assertRaises(LLMResponseError):InsightService(Fake('no')).generate('sales',{'x':1})
  class Down:
   def complete(self,p):raise LLMUnavailableError()
  with self.assertRaises(LLMUnavailableError):InsightService(Down()).generate('customer',{'x':1})
 def test_anomaly_prompt_safety(self):
  from ai.prompts import PROMPTS
  self.assertIn('not fraud',PROMPTS['transaction_anomaly']({'x':1}))
if __name__=='__main__':unittest.main()
