import json
def build(domain, intelligence):
    safety='Use only supplied structured data. Never invent values, events, amounts, causes, or guaranteed outcomes. Distinguish database facts, ML predictions, and business rules. Return one JSON object with summary, confidence_note, and relevant list fields.'
    if domain=='transaction_anomaly': safety+=' An anomaly is not fraud; never claim fraud, misconduct, or crime.'
    if domain=='invoice_collection': safety+=' Distinguish current invoice facts from historical payment risk; never guarantee recovery.'
    if domain=='inventory': safety+=' Never invent lead time, safety stock, costs, or order quantity.'
    return f'Domain: {domain}. {safety} Data: '+json.dumps(intelligence,default=str,sort_keys=True)
