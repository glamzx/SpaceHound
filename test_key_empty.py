from google import genai
import sys
try:
    client = genai.Client(api_key="")
    result = client.models.generate_content(
        model='gemini-2.5-flash',
        contents='hello'
    )
except Exception as e:
    print(f"FAILED: {e}")
