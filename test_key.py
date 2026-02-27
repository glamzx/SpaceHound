from google import genai
import sys

try:
    client = genai.Client(api_key="AIzaSyCqyeXG8xhchxHi41p-MtmskSvu5KyMoOs")
    result = client.models.generate_content(
        model='gemini-2.5-flash',
        contents='hello'
    )
    print("SUCCESS")
    print(result.text)
except Exception as e:
    print(f"FAILED: {e}")
