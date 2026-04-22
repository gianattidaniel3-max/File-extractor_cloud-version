import fitz  # PyMuPDF
import base64
import json
from openai import OpenAI
import os
from dotenv import load_dotenv

load_dotenv()

def encode_image(pix):
    """Encodes a PyMuPDF pixmap into a base64 string"""
    # Convert pixmap to PNG bytes, then base64 encode
    img_bytes = pix.tobytes("png")
    return base64.b64encode(img_bytes).decode("utf-8")

def process_pdf_with_vision(pdf_path: str, original_filename: str = "Unknown.pdf", schema_json_str: str = "{}", ai_context: str = "", max_pages: int = 5) -> dict:
    """
    TRICK: Token-Saving Hybrid Logic.
    1. If digital text is found, we send it (cheap).
    2. We send Page 1 at High Detail (to see stamps/layout).
    3. We send secondary pages as text OR Low Detail images.
    """
    doc = fitz.open(pdf_path)
    content_payload = []
    
    # 1. Triage: Check for digital text
    full_text = ""
    for i in range(min(len(doc), max_pages)):
        full_text += f"\n--- Pagina {i+1} ---\n" + doc[i].get_text()
    
    has_text = len(full_text.strip()) > 100 # Threshold for digital PDF
    
    # 2. Image Processing
    pages_to_process = min(len(doc), max_pages)
    zoom_matrix = fitz.Matrix(1.5, 1.5)
    
    # User message construction
    user_content = [
        {
            "type": "text", 
            "text": f"Dati da estrarre (Schema):\n{schema_json_str}\n\nFilenome originale: '{original_filename}'.\n\nESTRATTO TESTUALE (Se presente):\n{full_text if has_text else '[Nessun testo digitale rilevato, usa la visione]'}"
        }
    ]
    
    for i in range(pages_to_process):
        page = doc[i]
        pix = page.get_pixmap(matrix=zoom_matrix)
        b64_img = encode_image(pix)
        
        # TRICK: Only the first page is 'high' detail. Others are 'low' (85 tokens instead of ~1200).
        detail_mode = "high" if i == 0 else "low"
        
        user_content.append({
            "type": "image_url",
            "image_url": {
                "url": f"data:image/png;base64,{b64_img}",
                "detail": detail_mode
            }
        })
        
    doc.close()
    
    # Description for taxonomy
    desc_path = os.path.join(os.path.dirname(__file__), "resources", "descriptions.json")
    try:
        with open(desc_path, "r", encoding="utf-8") as f:
            descriptions = f.read()
    except Exception:
        descriptions = "{}"
    
    system_instruction = """You are an expert Italian legal data extraction engine. 
Analyze the provided document (Images + Text) and output a pure JSON object strictly formatted as:

{
  "metadata": {
    "label": "<specific document type from taxonomy>",
    "category": "<matching overarching category>",
    "data_documento": "DD/MM/YYYY",
    "data_protocollo": "DD/MM/YYYY (if present, else null)",
    "confidence_score": 0-100
  },
  "fields": {
    "<field_name_1>": {"value": "<extracted>", "confidence": 0-100},
    "<field_name_2>": {"value": "<extracted>", "confidence": 0-100}
  },
  "spontaneous_fields": {
    "<extra_field_A>": {"value": "<extracted>", "confidence": 0-100},
    "<extra_field_B>": {"value": "<extracted>", "confidence": 0-100}
  }
}

CRITICAL RULES:
1. Select the "label" against the taxonomy.
2. The "fields" MUST match the required expected_fields_per_type for that label.
3. Every field value MUST be an object with "value" and "confidence" (0-100 estimate of accuracy).
4. SPONTANEOUS EXTRACTION: Identify any other relevant data not in the taxonomy (e.g. Total Amounts, secondary page references, extra parties) and put them in "spontaneous_fields".
5. DATE TRIAGE:
   - "data_documento": The primary date of issuance/signature in the text.
   - "data_protocollo": The date found on rubber stamps or protocol headers (Page 1).
   - Use the Italian format DD/MM/YYYY.
   - Ignore birth dates or random reference dates in the text.
6. Use the High-Detail image of Page 1 to verify stamps or signatures.
7. If digital text is provided, prefer it for long strings (like addresses or names) to avoid OCR typos.
8. If a field or date cannot be found, return null for value and 0 for confidence. (DO NOT invent dates)"""

    if ai_context.strip():
        system_instruction += f"\n\nCRITICAL CONTEXT:\n{ai_context}"
    system_instruction += f"\n\nSEMANTIC DEFINITIONS:\n{descriptions}"

    messages = [
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": user_content}
    ]
    
    # Instantiate client dynamically to pick up any .env updates
    from dotenv import dotenv_values
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    env_config = dotenv_values(env_path) if os.path.exists(env_path) else {}
    current_key = env_config.get("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY")
    
    if not current_key:
        return {"error": "API Key mancante. Vai in Impostazioni API e inserisci una chiave valida."}

    dynamic_client = OpenAI(api_key=current_key.strip().replace('"', '').replace("'", ""))
    
    try:
        response = dynamic_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            response_format={"type": "json_object"},
            temperature=0.0
        )
    except Exception as api_err:
        return {"error": f"Errore chiamata OpenAI: {str(api_err)}"}

    
    try:
        return json.loads(response.choices[0].message.content)
    except Exception:
        return {"error": "JSON Parse Error", "raw": response.choices[0].message.content}

def perform_cross_analysis(data_list: list, rules_prompt: str) -> str:
    """
    Analyzes multiple document extractions based on user rules.
    data_list: List of dicts representing Document extractions.
    rules_prompt: User instructions (e.g. ' find mortgages').
    """
    context_str = json.dumps(data_list, indent=2, ensure_ascii=False)
    
    system_prompt = """You are an Italian Legal Expert and Data Auditor. 
You will be provided with a JSON array containing extracted data from MULTIPLE documents belonging to the same legal dossier.
Your task is to apply the following RULES or AUDIT CRITERIA provided by the user and produce a comprehensive report.

RULES TO APPLY:
{rules}

INSTRUCTIONS:
1. Be precise and professional.
2. Per ogni punto di analisi richiesto, devi fornire:
   - RISULTATO: La conclusione sintetica.
   - MOTIVAZIONE: Una breve spiegazione ("Perché") basata sulle evidenze trovate nei documenti.
3. If data is missing to confirm a rule, state it clearly.
4. Highlight contradictions between documents if found (e.g., different amounts for the same tax).
5. Use Markdown for formatting (bolding, lists, tables).
6. Output in Italian.
""".format(rules=rules_prompt)

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"DATA CONTEXT:\n{context_str}"}
    ]

    # Pick up key as in previous function
    from dotenv import dotenv_values
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    env_config = dotenv_values(env_path) if os.path.exists(env_path) else {}
    current_key = env_config.get("OPENAI_API_KEY") or os.getenv("OPENAI_API_KEY")
    
    if not current_key:
        return "Errore: API Key mancante."

    dynamic_client = OpenAI(api_key=current_key.strip().replace('"', '').replace("'", ""))
    
    try:
        response = dynamic_client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            temperature=0.2
        )
        return response.choices[0].message.content
    except Exception as e:
        return f"Errore durante l'analisi incrociata: {str(e)}"
