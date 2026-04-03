"""
generate_dataset.py — Two-model synthetic scam/safe dataset generation pipeline.

Generates 16K-24K+ labeled training samples across 8 scam vectors using:
  - Gemini 2.5 Flash (~75% of samples)
  - Ollama Llama 3.1 8B (~25% of samples)

Threat-weighted distribution per D-12. Safe class is ~50% of total per D-13.
Hard negatives included in safe class per D-09/D-10/D-11.

Usage:
    python research/scripts/generate_dataset.py

Environment:
    GEMINI_API_KEY — required. Get from https://aistudio.google.com/apikey

Resumable: if OUTPUT_PATH already exists, loads existing samples and continues
from remaining targets per vector.
"""

import json
import os
import sys
import time
import random
from collections import Counter
from pathlib import Path

import requests
from google import genai
from google.genai import types
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

VECTORS = {
    "crypto_investment": 3000,       # ~2.5x base (D-12: hardest, fastest growing)
    "romance_grooming": 3000,        # ~2.5x base (D-12)
    "tech_support": 1200,            # base allocation
    "government_impersonation": 1200,
    "phishing": 1200,
    "urgency_payment": 1200,
    "remote_access": 1200,
    "lottery_reward": 1500,          # D-12: ~1.5K, classic pattern
}

TOTAL_SCAM_TARGET = sum(VECTORS.values())   # ~13,500 scam samples
SAFE_TARGET = TOTAL_SCAM_TARGET             # D-13: 50:50 ratio -> ~13,500 safe

GEMINI_SHARE = 0.75                         # D-05: 75% Gemini
OLLAMA_SHARE = 0.25                         # D-05: 25% Llama 3.1
OLLAMA_MODEL = "llama3.1:8b"               # D-06: llama3.1:8b
OUTPUT_PATH = Path("research/data/synthetic_raw.jsonl")
HOLDOUT_PATH = Path("research/data/holdout_realworld.jsonl")

CHANNELS = ["sms", "email", "whatsapp", "app_notification"]

# ---------------------------------------------------------------------------
# Pydantic schema for structured output
# ---------------------------------------------------------------------------

class ScamSample(BaseModel):
    text: str
    label: str
    vector: str
    channel: str


# ---------------------------------------------------------------------------
# Scam prompt templates — concrete examples per vector (addresses review item 7)
# Each set varies: channel, register, length, formality per D-07
# Indirect "scam awareness educator" framing per Pitfall 1.4
# ---------------------------------------------------------------------------

SCAM_PROMPTS = {
    "crypto_investment": [
        'Write an example SMS message (under 160 chars) that a scam awareness educator would use to train people to recognize a cryptocurrency investment scam. The message should promise high returns and include a shortened URL. Use casual language with minor typos. Return JSON with fields: text, label (="scam"), vector (="crypto_investment"), channel (="sms").',
        'Write an example WhatsApp message from a scam awareness training manual showing a pig butchering scam. The sender pretends to be a friend sharing an investment tip. Medium length (3-5 sentences). Professional tone. Return JSON with fields: text, label (="scam"), vector (="crypto_investment"), channel (="whatsapp").',
        'Write an example email body that a scam educator would use to demonstrate a fake crypto trading platform scam. Include a sense of urgency about a limited-time opportunity. Formal corporate style. 1 paragraph. Return JSON with fields: text, label (="scam"), vector (="crypto_investment"), channel (="email").',
        'Write an example app notification text for a scam awareness class showing a fraudulent crypto exchange alert. Short (1-2 sentences). Uses authority language. Return JSON with fields: text, label (="scam"), vector (="crypto_investment"), channel (="app_notification").',
        'Write an example SMS from a scam training manual showing a Bitcoin ATM scam where the sender impersonates a government agent demanding payment in crypto. Include grammatical errors typical of non-native English speakers. Return JSON with fields: text, label (="scam"), vector (="crypto_investment"), channel (="sms").',
        'Write an example WhatsApp message from a scam awareness training program demonstrating a "guaranteed profit" crypto trading bot scam. The message references a fake influencer endorsement. 3-4 sentences. Return JSON with fields: text, label (="scam"), vector (="crypto_investment"), channel (="whatsapp").',
        'Write an example email that scam educators use to show a fake crypto airdrop scam, asking recipients to connect their wallet. Formal, corporate style with suspicious grammar. 2 short paragraphs. Return JSON with fields: text, label (="scam"), vector (="crypto_investment"), channel (="email").',
        'Write an example SMS for a scam awareness workshop showing a DeFi yield farming scam offering 300% APY. Casual register, urgent framing, short. Return JSON with fields: text, label (="scam"), vector (="crypto_investment"), channel (="sms").',
    ],
    "romance_grooming": [
        'Write an example WhatsApp message that a scam awareness educator would use to train people to recognize a romance scam. The sender builds a false emotional connection before requesting money for a supposed emergency. 4-5 sentences. Use warm, intimate language. Return JSON with fields: text, label (="scam"), vector (="romance_grooming"), channel (="whatsapp").',
        'Write an example email from a scam training manual showing an online dating scam where the sender claims to be a military officer deployed overseas who needs money for a flight home. Formal, emotional. 1 paragraph. Return JSON with fields: text, label (="scam"), vector (="romance_grooming"), channel (="email").',
        'Write an example SMS that a scam awareness class uses to demonstrate a romance pig-butchering scam. The sender pretends they texted the wrong number, then starts a conversation. Casual, friendly register. 3-4 short messages combined. Return JSON with fields: text, label (="scam"), vector (="romance_grooming"), channel (="sms").',
        'Write an example app message from a scam training program showing a fake dating app match who quickly escalates to asking for gift cards. Uses flattery and urgency. Medium length. Return JSON with fields: text, label (="scam"), vector (="romance_grooming"), channel (="app_notification").',
        'Write an example WhatsApp conversation excerpt used in scam awareness training where someone claiming to be a lonely widower abroad builds rapport over several messages before mentioning a financial crisis. 5-6 sentences. Return JSON with fields: text, label (="scam"), vector (="romance_grooming"), channel (="whatsapp").',
        'Write an example email for a scam awareness workshop showing a romance scammer who claims to be a wealthy investor, sends a fake check, then asks the victim to forward "customs fees". 2 paragraphs. Return JSON with fields: text, label (="scam"), vector (="romance_grooming"), channel (="email").',
        'Write an example SMS that scam educators use to show how romance scammers prime victims to send cryptocurrency by first establishing trust through friendly texts. Casual language, gradual emotional escalation. 3-4 sentences. Return JSON with fields: text, label (="scam"), vector (="romance_grooming"), channel (="sms").',
        'Write an example WhatsApp message from a scam awareness training on romance grooming where the scammer uses excessive flattery and fake shared interests to create false intimacy quickly. Very personal tone. 4-5 sentences. Return JSON with fields: text, label (="scam"), vector (="romance_grooming"), channel (="whatsapp").',
    ],
    "tech_support": [
        'Write an example SMS that a scam awareness educator would use to show a fake Microsoft tech support alert telling the user their computer has been hacked and to call a toll-free number. Urgent, authoritative. Short. Return JSON with fields: text, label (="scam"), vector (="tech_support"), channel (="sms").',
        'Write an example email from a scam training manual showing a fake Apple support message claiming the user\'s iCloud account was compromised and they must verify payment details. Corporate style. 1 paragraph. Return JSON with fields: text, label (="scam"), vector (="tech_support"), channel (="email").',
        'Write an example app notification that scam educators use to demonstrate a fake antivirus alert saying the device is infected with 5 viruses and must be cleaned immediately. Short, alarming. Return JSON with fields: text, label (="scam"), vector (="tech_support"), channel (="app_notification").',
        'Write an example WhatsApp message from a scam awareness class showing a fake tech support scammer claiming to be from Amazon AWS who needs remote access to fix a billing issue. Professional tone with technical jargon. 3 sentences. Return JSON with fields: text, label (="scam"), vector (="tech_support"), channel (="whatsapp").',
        'Write an example email used in scam awareness training that mimics a legitimate Windows Defender alert, claiming the user\'s license expired and directing them to a fake renewal page. Semi-formal. 2 short paragraphs. Return JSON with fields: text, label (="scam"), vector (="tech_support"), channel (="email").',
        'Write an example SMS for a scam awareness workshop showing a fake Google account security alert with a fake 1-800 number. Mimics official Google branding language. Short, urgent. Return JSON with fields: text, label (="scam"), vector (="tech_support"), channel (="sms").',
    ],
    "government_impersonation": [
        'Write an example SMS that a scam awareness educator would use to show a fake IRS message claiming the recipient owes back taxes and faces immediate arrest if they don\'t pay via gift cards. Urgent, threatening. Short. Return JSON with fields: text, label (="scam"), vector (="government_impersonation"), channel (="sms").',
        'Write an example email from a scam training manual showing a fake Social Security Administration notice claiming the recipient\'s SSN was used in criminal activity and they must call a number immediately to avoid suspension. Formal, official-looking. 2 paragraphs. Return JSON with fields: text, label (="scam"), vector (="government_impersonation"), channel (="email").',
        'Write an example WhatsApp message that scam educators use to show an impersonation of USCIS (immigration agency) claiming the recipient\'s visa application has an issue requiring immediate payment. Non-native English register. 3-4 sentences. Return JSON with fields: text, label (="scam"), vector (="government_impersonation"), channel (="whatsapp").',
        'Write an example app notification from a scam awareness class showing a fake Medicare alert saying benefits will be suspended unless the recipient verifies their information. Short, official-sounding. Return JSON with fields: text, label (="scam"), vector (="government_impersonation"), channel (="app_notification").',
        'Write an example SMS for a scam awareness workshop showing a fake local police department message claiming outstanding warrants and requiring payment via wire transfer to avoid arrest. Urgent, threatening tone. Short. Return JSON with fields: text, label (="scam"), vector (="government_impersonation"), channel (="sms").',
        'Write an example email used in scam awareness training showing a fake IRS audit notice with a case number, demanding immediate response and claiming all bank accounts will be frozen. Formal corporate style. 2 paragraphs. Return JSON with fields: text, label (="scam"), vector (="government_impersonation"), channel (="email").',
    ],
    "phishing": [
        'Write an example email that a scam awareness educator would use to show a phishing attempt mimicking a Chase bank security alert asking the recipient to verify their account by clicking a link. Corporate style, urgent. 2 short paragraphs. Return JSON with fields: text, label (="scam"), vector (="phishing"), channel (="email").',
        'Write an example SMS from a scam training manual showing a fake PayPal account suspension notice with a suspicious link to restore access. Urgent, short. Return JSON with fields: text, label (="scam"), vector (="phishing"), channel (="sms").',
        'Write an example WhatsApp message that scam educators use to show a phishing attack using a fake shared document link from what appears to be a coworker. Casual, professional. 2 sentences. Return JSON with fields: text, label (="scam"), vector (="phishing"), channel (="whatsapp").',
        'Write an example email used in scam awareness training that mimics an Amazon order confirmation with a fake "report unauthorized purchase" link leading to credential theft. Semi-formal. 2 paragraphs. Return JSON with fields: text, label (="scam"), vector (="phishing"), channel (="email").',
        'Write an example app notification from a scam awareness workshop showing a fake Instagram security alert asking the user to tap a link to secure their account. Short, alarming. Return JSON with fields: text, label (="scam"), vector (="phishing"), channel (="app_notification").',
        'Write an example SMS for scam awareness training showing a fake bank fraud alert with a spoofed short code asking the recipient to call back on a fake number. Short, urgent. Minor grammatical errors. Return JSON with fields: text, label (="scam"), vector (="phishing"), channel (="sms").',
    ],
    "urgency_payment": [
        'Write an example SMS that a scam awareness educator would use to show a grandparent scam where someone claims to be a grandchild arrested and needing bail money immediately. Emotional, urgent. 2-3 sentences. Return JSON with fields: text, label (="scam"), vector (="urgency_payment"), channel (="sms").',
        'Write an example email from a scam training manual showing a fake "CEO email fraud" where a scammer impersonates a company executive and demands an urgent wire transfer. Formal, authoritative. 1 paragraph. Return JSON with fields: text, label (="scam"), vector (="urgency_payment"), channel (="email").',
        'Write an example WhatsApp message that scam educators use to show a friend or family impersonation scam where someone claiming to be a friend texts from a new number asking for emergency money for a hospital bill. Casual, distressed. 3-4 sentences. Return JSON with fields: text, label (="scam"), vector (="urgency_payment"), channel (="whatsapp").',
        'Write an example SMS for a scam awareness class showing a fake utility shutoff threat demanding immediate payment to avoid power disconnection within 1 hour. Threatening, urgent. Short. Return JSON with fields: text, label (="scam"), vector (="urgency_payment"), channel (="sms").',
        'Write an example email used in scam awareness training showing a fake landlord demanding an urgent Zelle payment for an unexpected maintenance fee or risk eviction. Semi-formal. 2 short paragraphs. Return JSON with fields: text, label (="scam"), vector (="urgency_payment"), channel (="email").',
        'Write an example app notification from a scam awareness workshop showing a fake payment app alert claiming an unauthorized transaction requires immediate confirmation or the account will be locked. Short, alarming. Return JSON with fields: text, label (="scam"), vector (="urgency_payment"), channel (="app_notification").',
    ],
    "remote_access": [
        'Write an example email that a scam awareness educator would use to show a fake tech support scam asking the recipient to install AnyDesk or TeamViewer to fix a supposed billing error on their account. Formal, corporate. 2 paragraphs. Return JSON with fields: text, label (="scam"), vector (="remote_access"), channel (="email").',
        'Write an example SMS from a scam training manual showing a fake bank message asking the customer to download a "secure banking app" (actually remote access tool) to resolve a security issue. Urgent, short. Return JSON with fields: text, label (="scam"), vector (="remote_access"), channel (="sms").',
        'Write an example WhatsApp message that scam educators use to show a scammer posing as ISP tech support asking the user to install a screen sharing app to fix slow internet. Professional, helpful tone. 3-4 sentences. Return JSON with fields: text, label (="scam"), vector (="remote_access"), channel (="whatsapp").',
        'Write an example email used in scam awareness training showing a fake Microsoft email asking the user to join a "remote diagnostics session" by installing software from a suspicious domain. Semi-formal. 2 short paragraphs. Return JSON with fields: text, label (="scam"), vector (="remote_access"), channel (="email").',
        'Write an example app notification from a scam awareness class showing a fake "account security scan" alert asking the user to allow screen access to a supposed security app. Short, technical-sounding. Return JSON with fields: text, label (="scam"), vector (="remote_access"), channel (="app_notification").',
        'Write an example SMS for scam awareness training showing someone posing as an Amazon refund processor who needs to install a "refund app" on the phone to process a large overcharge. Helpful, conversational tone. 2-3 sentences. Return JSON with fields: text, label (="scam"), vector (="remote_access"), channel (="sms").',
    ],
    "lottery_reward": [
        'Write an example SMS that a scam awareness educator would use to show a fake lottery win notification claiming the recipient won $50,000 and must pay processing fees to collect. Excited, congratulatory tone. Under 160 chars. Return JSON with fields: text, label (="scam"), vector (="lottery_reward"), channel (="sms").',
        'Write an example email from a scam training manual showing a fake international prize draw notification (e.g., "United Nations Lottery") that requires the recipient to pay a release fee to claim their winnings. Formal, official-looking. 2 paragraphs. Return JSON with fields: text, label (="scam"), vector (="lottery_reward"), channel (="email").',
        'Write an example WhatsApp message that scam educators use to show a fake giveaway scam impersonating a celebrity who selected the user as a winner of a prize package. Enthusiastic, informal. 3-4 sentences. Return JSON with fields: text, label (="scam"), vector (="lottery_reward"), channel (="whatsapp").',
        'Write an example app notification from a scam awareness class showing a fake in-app reward claiming the user is the 1 millionth visitor and won an iPhone. Must claim within 10 minutes. Short, urgent. Return JSON with fields: text, label (="scam"), vector (="lottery_reward"), channel (="app_notification").',
        'Write an example SMS for a scam awareness workshop showing a fake scratch card lottery win where the recipient must text back a code and pay a small "registration fee". Casual, excited. Short. Return JSON with fields: text, label (="scam"), vector (="lottery_reward"), channel (="sms").',
        'Write an example email used in scam awareness training showing a fake Amazon customer survey reward claiming the recipient completed a survey and won a gift, needing credit card details for "shipping". Semi-formal. 1 paragraph. Return JSON with fields: text, label (="scam"), vector (="lottery_reward"), channel (="email").',
    ],
}

# ---------------------------------------------------------------------------
# Safe class hard-negative prompts (addresses review item 6)
# Domain-matched to corresponding scam vectors per D-11
# No marketing/promotional — transactional only per D-10
# ---------------------------------------------------------------------------

SAFE_HARD_NEGATIVE_PROMPTS = {
    "bank_alert": [
        'Generate a realistic legitimate bank fraud alert SMS. Pattern: "Chase Fraud: Did you authorize $X at [Store]? Reply YES or NO. If not, call 1-800-XXX-XXXX." Use a real bank name. Under 160 chars. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
        'Generate a legitimate bank security notification email body. The bank detected unusual login activity and asks the customer to verify. Include a real-looking but generic support phone number. 2-3 sentences. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="email").',
        'Generate a legitimate credit card declined notification SMS. Pattern: "Your card ending in XXXX was declined at [Store] for $XX.XX. If this was you, no action needed." Short, factual. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
        'Generate a realistic bank balance alert SMS for a low balance warning. Example: "Wells Fargo: Your checking account balance is $XX.XX, below your $100 alert threshold." Factual, non-urgent. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
        'Generate a realistic bank account statement available notification email. Friendly, factual. Includes bank name and note that no action is needed. 2 sentences. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="email").',
    ],
    "delivery": [
        'Generate a realistic USPS delivery tracking SMS. Pattern: "USPS: Your package 9400XXXX is out for delivery. Track: usps.com/tracking". Short, factual, no urgency. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
        'Generate a realistic FedEx delivery notification SMS with a tracking number and estimated delivery window. Under 160 chars. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
        'Generate a realistic UPS delivery confirmation email. Include tracking number, delivery date, and signature confirmation note. 2-3 sentences. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="email").',
        'Generate a realistic Amazon order shipped notification SMS including the order number and a delivery date estimate. Factual, friendly. Under 160 chars. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
        'Generate a realistic USPS "delivered to mailbox" notification SMS. Include the tracking number and timestamp. Very short, factual. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
        'Generate a realistic DHL delivery scheduled notification WhatsApp message with tracking number and delivery window. 2 sentences, no urgency. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="whatsapp").',
    ],
    "twofa": [
        'Generate a realistic 2FA verification code SMS. Pattern: "Your [Service] verification code is XXXXXX. Do not share this code. It expires in 10 minutes." Under 160 chars. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
        'Generate a realistic login verification email from a service like Google or Apple. "We noticed a sign-in from [Device] in [Location]. If this was you, no action needed." 2-3 sentences. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="email").',
        'Generate a realistic bank one-time password (OTP) SMS for a wire transfer confirmation. Short, includes 6-digit code and instruction not to share. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
        'Generate a realistic app 2FA push notification text: "[App] Login request from [Device]. Tap to approve or deny." Very short, non-urgent. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="app_notification").',
        'Generate a realistic account recovery verification code email from a well-known service. Includes code, expiry time, and clear note that the user requested this. 3 sentences. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="email").',
    ],
    "medical": [
        'Generate a realistic pharmacy prescription ready notification SMS. Pattern: "[Pharmacy]: Your prescription for [Generic Med Name] is ready for pickup at [Location]." Under 160 chars. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
        'Generate a realistic medical appointment reminder SMS. Pattern: "Reminder: You have an appointment with Dr. [Name] on [Date] at [Time]. Reply C to confirm." Under 160 chars. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
        'Generate a realistic doctor appointment confirmation email from a medical office. Includes date, time, doctor name, location, and cancellation policy note. 3-4 sentences. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="email").',
        'Generate a realistic prescription refill reminder SMS from a pharmacy auto-refill program. Friendly, factual. Under 160 chars. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
        'Generate a realistic lab results notification from a healthcare portal: results are ready to view in the patient portal. No medical details, just a notification. 2 sentences. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="email").',
    ],
}

# Normal transactional safe prompts (~75% of safe class, not hard negatives)
SAFE_NORMAL_PROMPTS = [
    'Generate a realistic order confirmation SMS from an online retailer. Includes order number, item count, and expected delivery range. Factual, friendly. Under 160 chars. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
    'Generate a realistic meeting reminder calendar notification. Includes meeting title, time, and video call link. Short, factual. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="app_notification").',
    'Generate a realistic subscription renewal confirmation email. States the service name, renewal date, and amount charged. No urgency. 2-3 sentences. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="email").',
    'Generate a realistic travel itinerary confirmation SMS from an airline. Flight number, departure time, and gate. Short, factual. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
    'Generate a realistic gym membership check-in SMS confirmation. Friendly, factual. Under 100 chars. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
    'Generate a realistic customer service follow-up email asking if a support ticket issue was resolved. Friendly, professional. 2 sentences. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="email").',
    'Generate a realistic ride-sharing pickup confirmation SMS: driver name, car model, plate, ETA. Short, factual. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
    'Generate a realistic job application acknowledgment email. States the role applied for, confirms receipt, and says the team will review shortly. 2-3 sentences. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="email").',
    'Generate a realistic food delivery order confirmed SMS with estimated delivery time. Friendly, short. Under 160 chars. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
    'Generate a realistic hotel reservation confirmation WhatsApp message. Includes dates, room type, and check-in instructions. 3 sentences. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="whatsapp").',
    'Generate a realistic event ticket purchase confirmation SMS. Includes event name, date, venue, and seat. Under 160 chars. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
    'Generate a realistic password change notification email from a web service. States the change was made and provides a support contact if the user did not request it. 2-3 sentences. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="email").',
    'Generate a realistic utility bill payment confirmation SMS. Includes utility type, amount paid, and confirmation number. Factual, short. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="sms").',
    'Generate a realistic daily step goal achievement notification from a fitness app. Short, encouraging, factual. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="app_notification").',
    'Generate a realistic professional networking site connection request notification email. Friendly, professional. Includes the person\'s name and role. 2 sentences. Return JSON with fields: text, label (="safe"), vector (="safe"), channel (="email").',
]

# ---------------------------------------------------------------------------
# Ollama generation function
# ---------------------------------------------------------------------------

def generate_ollama(prompt: str, model: str = OLLAMA_MODEL) -> dict | None:
    """Generate one sample via local Ollama. Returns None on failure."""
    try:
        response = requests.post(
            "http://localhost:11434/api/generate",
            json={"model": model, "prompt": prompt, "stream": False, "format": "json"},
            timeout=180,  # CPU inference can be slow — allow 3 minutes per sample
        )
        response.raise_for_status()
        raw = response.json()["response"]
        try:
            sample = json.loads(raw)
        except json.JSONDecodeError:
            print(f"  Ollama returned non-JSON: {raw[:100]}...")
            return None
        sample["source"] = "llama3.1:8b"
        return sample
    except requests.Timeout:
        print("  Ollama timeout (180s) — sample skipped")
        return None
    except Exception as e:
        print(f"  Ollama error: {e}")
        return None


# ---------------------------------------------------------------------------
# Gemini generation function with exponential backoff (addresses review item 10)
# ---------------------------------------------------------------------------

def generate_gemini(prompt: str, client: genai.Client, max_retries: int = 3) -> dict | None:
    """Generate one sample via Gemini 2.5 Flash with exponential backoff."""
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_json_schema=ScamSample.model_json_schema(),
                ),
            )
            sample = json.loads(response.text)
            sample["source"] = "gemini-2.5-flash"
            return sample
        except Exception as e:
            if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                wait = 2 ** attempt  # 1s, 2s, 4s exponential backoff
                print(f"  Rate limited (429/RESOURCE_EXHAUSTED), retrying in {wait}s...")
                time.sleep(wait)
            else:
                print(f"  Gemini error: {e}")
                return None
    print(f"  Gemini failed after {max_retries} retries")
    return None


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def validate_sample(sample: dict, expected_vector: str | None = None) -> bool:
    """Return True if sample has all required fields and minimum quality."""
    if not isinstance(sample, dict):
        return False
    required = {"text", "label", "vector", "channel"}
    if not required.issubset(sample.keys()):
        return False
    if not isinstance(sample.get("text"), str) or len(sample["text"].split()) < 4:
        return False
    valid_labels = {"scam", "safe"}
    if sample.get("label") not in valid_labels:
        return False
    valid_channels = {"sms", "email", "whatsapp", "app_notification"}
    if sample.get("channel") not in valid_channels:
        return False
    return True


def load_holdout_texts(holdout_path: Path) -> set:
    """Load holdout file and return set of texts for contamination checking."""
    texts = set()
    with open(holdout_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    obj = json.loads(line)
                    texts.add(obj.get("text", "").strip())
                except json.JSONDecodeError:
                    pass
    return texts


def is_contaminated(text: str, holdout_texts: set) -> bool:
    """Check if text appears in holdout set (exact match contamination check)."""
    return text.strip() in holdout_texts


# ---------------------------------------------------------------------------
# Preflight checks (addresses review items 2, 3, 4)
# ---------------------------------------------------------------------------

def preflight_checks(client: genai.Client) -> dict:
    """Run all preflight checks before main generation. Returns timing info."""
    results = {}

    # Check 1: GEMINI_API_KEY set
    if not os.environ.get("GEMINI_API_KEY"):
        sys.exit("[PREFLIGHT FAIL] GEMINI_API_KEY not set. Get key from https://aistudio.google.com/apikey")

    # Check 2: Holdout exists
    if not HOLDOUT_PATH.exists():
        sys.exit(f"[PREFLIGHT FAIL] Holdout not found at {HOLDOUT_PATH}. Run Plan 01 first.")
    print(f"[PREFLIGHT OK] Holdout found at {HOLDOUT_PATH}")

    # Check 3: Ollama availability + model verification (review item 2)
    print("[PREFLIGHT] Checking Ollama...")
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=5)
        r.raise_for_status()
        models = [m["name"] for m in r.json().get("models", [])]
        base_model = OLLAMA_MODEL.split(":")[0]
        found = any(base_model in m for m in models)
        if not found:
            sys.exit(
                f"[PREFLIGHT FAIL] {OLLAMA_MODEL} not found in Ollama. Available: {models}\n"
                f"Run: ollama pull {OLLAMA_MODEL}"
            )
        print(f"[PREFLIGHT OK] Ollama running, {OLLAMA_MODEL} available (models: {models[:3]}...)")
    except requests.ConnectionError:
        sys.exit("[PREFLIGHT FAIL] Ollama not running at localhost:11434. Start with: ollama serve")
    except requests.Timeout:
        sys.exit("[PREFLIGHT FAIL] Ollama at localhost:11434 timed out. Is it running?")

    # Check 4: Ollama hardware benchmark (review item 3)
    print("[PREFLIGHT] Benchmarking Ollama inference speed (2 test samples)...")
    ollama_times = []
    for i in range(2):
        start = time.time()
        test_result = generate_ollama("Write a short test message about the weather. Return JSON with fields: text, label, vector, channel.")
        elapsed = time.time() - start
        ollama_times.append(elapsed)
        print(f"  Test sample {i + 1}: {elapsed:.1f}s | result: {str(test_result)[:60] if test_result else 'None'}")
    avg_time = sum(ollama_times) / len(ollama_times)
    ollama_sample_count = int((TOTAL_SCAM_TARGET + SAFE_TARGET) * OLLAMA_SHARE)
    ollama_total_estimate = avg_time * ollama_sample_count
    print(f"[PREFLIGHT] Ollama avg: {avg_time:.1f}s/sample. Estimated total for {ollama_sample_count} samples: {ollama_total_estimate / 3600:.1f} hours")
    if ollama_total_estimate > 86400:
        print(f"[WARNING] Ollama generation will take >{ollama_total_estimate / 3600:.0f} hours.")
        print("  Consider reducing OLLAMA_SHARE to 0.15 (document deviation from D-05)")
    results["ollama_avg_seconds"] = avg_time

    # Check 5: Gemini preflight test (review item 4)
    print("[PREFLIGHT] Testing Gemini with 5 vectors (5 samples)...")
    test_vectors = ["crypto_investment", "romance_grooming", "tech_support", "phishing", "lottery_reward"]
    gemini_failures = 0
    for vector in test_vectors:
        prompt = (
            f"Write an example SMS that a scam awareness educator would use to demonstrate a "
            f"{vector.replace('_', ' ')} scam. Return JSON with fields: text (the message), "
            f"label (='scam'), vector (='{vector}'), channel (='sms')."
        )
        result = generate_gemini(prompt, client)
        if result is None:
            gemini_failures += 1
            print(f"  [FAIL] {vector}: Gemini refused or returned invalid JSON")
        else:
            print(f"  [OK] {vector}: {str(result.get('text', ''))[:60]}...")
    if gemini_failures > 1:
        sys.exit(
            f"[PREFLIGHT FAIL] Gemini rejected {gemini_failures}/5 test prompts. "
            "Revise indirect prompting strategy before proceeding."
        )
    print(f"[PREFLIGHT OK] Gemini: {5 - gemini_failures}/5 test prompts succeeded")

    return results


# ---------------------------------------------------------------------------
# Load existing samples for resumability
# ---------------------------------------------------------------------------

def load_existing_samples(output_path: Path) -> tuple[list, Counter, Counter]:
    """
    Load existing samples from output file (for resumable generation).
    Returns (samples_list, vector_counter, safe_count_int).
    """
    samples = []
    if not output_path.exists():
        return samples, Counter(), Counter()

    with open(output_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    obj = json.loads(line)
                    samples.append(obj)
                except json.JSONDecodeError:
                    pass

    scam_counts = Counter(s["vector"] for s in samples if s.get("label") == "scam")
    safe_count = Counter(s["label"] for s in samples)
    return samples, scam_counts, safe_count


# ---------------------------------------------------------------------------
# Main generation loop
# ---------------------------------------------------------------------------

def generate_for_vector(
    vector: str,
    target: int,
    existing_count: int,
    client: genai.Client,
    holdout_texts: set,
    output_file,
    preflight_timing: dict,
) -> int:
    """Generate samples for a single scam vector. Returns count of new samples generated."""
    remaining = target - existing_count
    if remaining <= 0:
        print(f"[SKIP] {vector}: already at {existing_count}/{target}")
        return 0

    print(f"\n[START] {vector}: need {remaining} more samples (existing: {existing_count}, target: {target})")

    prompts = SCAM_PROMPTS[vector]
    gemini_target = int(remaining * GEMINI_SHARE)
    ollama_target = remaining - gemini_target

    # For romance_grooming and government_impersonation: increase Ollama share
    # (Pitfall 1.4: safety filter bypass for sensitive vectors)
    if vector in ("romance_grooming", "government_impersonation"):
        ollama_target = int(remaining * 0.5)
        gemini_target = remaining - ollama_target

    generated = 0
    start_time = time.time()
    gemini_done = 0
    ollama_done = 0
    skipped = 0

    # Gemini generation
    prompt_idx = 0
    while gemini_done < gemini_target:
        prompt = prompts[prompt_idx % len(prompts)]
        prompt_idx += 1
        sample = generate_gemini(prompt, client)
        if sample and validate_sample(sample) and not is_contaminated(sample.get("text", ""), holdout_texts):
            sample["vector"] = vector
            sample["label"] = "scam"
            output_file.write(json.dumps(sample) + "\n")
            output_file.flush()
            gemini_done += 1
            generated += 1
        else:
            skipped += 1

        # Per-vector progress with ETA (addresses review item 13)
        total_done = gemini_done + ollama_done
        if total_done > 0 and total_done % 100 == 0:
            elapsed = time.time() - start_time
            rate = total_done / elapsed if elapsed > 0 else 1
            eta_seconds = (remaining - total_done) / rate if rate > 0 else 0
            eta_hours = eta_seconds / 3600
            print(
                f"  [{total_done}/{remaining} {vector}] ETA: {eta_hours:.2f}h | "
                f"Gemini: {gemini_done}, Ollama: {ollama_done}, Skipped: {skipped}"
            )

    # Ollama generation
    prompt_idx = 0
    while ollama_done < ollama_target:
        prompt = prompts[prompt_idx % len(prompts)]
        prompt_idx += 1
        sample = generate_ollama(prompt)
        if sample and validate_sample(sample) and not is_contaminated(sample.get("text", ""), holdout_texts):
            sample["vector"] = vector
            sample["label"] = "scam"
            output_file.write(json.dumps(sample) + "\n")
            output_file.flush()
            ollama_done += 1
            generated += 1
        else:
            skipped += 1

        total_done = gemini_done + ollama_done
        if total_done > 0 and total_done % 100 == 0:
            elapsed = time.time() - start_time
            rate = total_done / elapsed if elapsed > 0 else 1
            eta_seconds = (remaining - total_done) / rate if rate > 0 else 0
            eta_hours = eta_seconds / 3600
            print(
                f"  [{total_done}/{remaining} {vector}] ETA: {eta_hours:.2f}h | "
                f"Gemini: {gemini_done}, Ollama: {ollama_done}, Skipped: {skipped}"
            )

    elapsed = time.time() - start_time
    print(
        f"[DONE] {vector}: {generated} new samples in {elapsed:.0f}s "
        f"(Gemini: {gemini_done}, Ollama: {ollama_done}, Skipped: {skipped})"
    )
    return generated


def generate_safe_samples(
    target: int,
    existing_safe_count: int,
    client: genai.Client,
    holdout_texts: set,
    output_file,
) -> int:
    """Generate safe class samples. Returns count of new samples generated."""
    remaining = target - existing_safe_count
    if remaining <= 0:
        print(f"[SKIP] safe class: already at {existing_safe_count}/{target}")
        return 0

    print(f"\n[START] safe class: need {remaining} more samples (existing: {existing_safe_count}, target: {target})")

    # ~25% hard negatives (D-09), ~75% normal transactional
    hard_negative_target = int(remaining * 0.25)
    normal_target = remaining - hard_negative_target

    generated = 0
    start_time = time.time()
    gemini_done = 0
    ollama_done = 0
    hard_neg_done = 0
    normal_done = 0
    skipped = 0

    # Hard negatives — cycle through all types per D-11
    all_hard_neg_prompts = []
    for prompts in SAFE_HARD_NEGATIVE_PROMPTS.values():
        all_hard_neg_prompts.extend(prompts)
    random.shuffle(all_hard_neg_prompts)

    prompt_idx = 0
    while hard_neg_done < hard_negative_target:
        prompt = all_hard_neg_prompts[prompt_idx % len(all_hard_neg_prompts)]
        prompt_idx += 1

        # Alternate between Gemini and Ollama for hard negatives
        if hard_neg_done % 4 == 0:
            sample = generate_ollama(prompt)
            if sample and validate_sample(sample) and not is_contaminated(sample.get("text", ""), holdout_texts):
                sample["vector"] = "safe"
                sample["label"] = "safe"
                output_file.write(json.dumps(sample) + "\n")
                output_file.flush()
                hard_neg_done += 1
                ollama_done += 1
                generated += 1
            else:
                skipped += 1
        else:
            sample = generate_gemini(prompt, client)
            if sample and validate_sample(sample) and not is_contaminated(sample.get("text", ""), holdout_texts):
                sample["vector"] = "safe"
                sample["label"] = "safe"
                output_file.write(json.dumps(sample) + "\n")
                output_file.flush()
                hard_neg_done += 1
                gemini_done += 1
                generated += 1
            else:
                skipped += 1

        total_done = hard_neg_done + normal_done
        if total_done > 0 and total_done % 100 == 0:
            elapsed = time.time() - start_time
            rate = total_done / elapsed if elapsed > 0 else 1
            eta_seconds = (remaining - total_done) / rate if rate > 0 else 0
            eta_hours = eta_seconds / 3600
            print(
                f"  [{total_done}/{remaining} safe] ETA: {eta_hours:.2f}h | "
                f"Gemini: {gemini_done}, Ollama: {ollama_done}, HardNeg: {hard_neg_done}, Skipped: {skipped}"
            )

    # Normal transactional samples
    random.shuffle(SAFE_NORMAL_PROMPTS)
    prompt_idx = 0
    while normal_done < normal_target:
        prompt = SAFE_NORMAL_PROMPTS[prompt_idx % len(SAFE_NORMAL_PROMPTS)]
        prompt_idx += 1

        if normal_done % 4 == 0:
            sample = generate_ollama(prompt)
            if sample and validate_sample(sample) and not is_contaminated(sample.get("text", ""), holdout_texts):
                sample["vector"] = "safe"
                sample["label"] = "safe"
                output_file.write(json.dumps(sample) + "\n")
                output_file.flush()
                normal_done += 1
                ollama_done += 1
                generated += 1
            else:
                skipped += 1
        else:
            sample = generate_gemini(prompt, client)
            if sample and validate_sample(sample) and not is_contaminated(sample.get("text", ""), holdout_texts):
                sample["vector"] = "safe"
                sample["label"] = "safe"
                output_file.write(json.dumps(sample) + "\n")
                output_file.flush()
                normal_done += 1
                gemini_done += 1
                generated += 1
            else:
                skipped += 1

        total_done = hard_neg_done + normal_done
        if total_done > 0 and total_done % 100 == 0:
            elapsed = time.time() - start_time
            rate = total_done / elapsed if elapsed > 0 else 1
            eta_seconds = (remaining - total_done) / rate if rate > 0 else 0
            eta_hours = eta_seconds / 3600
            print(
                f"  [{total_done}/{remaining} safe] ETA: {eta_hours:.2f}h | "
                f"Gemini: {gemini_done}, Ollama: {ollama_done}, Normal: {normal_done}, Skipped: {skipped}"
            )

    elapsed = time.time() - start_time
    print(
        f"[DONE] safe class: {generated} new samples in {elapsed:.0f}s "
        f"(Gemini: {gemini_done}, Ollama: {ollama_done}, HardNeg: {hard_neg_done}, Normal: {normal_done}, Skipped: {skipped})"
    )
    return generated


# ---------------------------------------------------------------------------
# Post-generation summary
# ---------------------------------------------------------------------------

def print_summary(output_path: Path) -> None:
    """Print post-generation summary of the dataset."""
    if not output_path.exists():
        print("[SUMMARY] Output file not found.")
        return

    samples = []
    with open(output_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    samples.append(json.loads(line))
                except json.JSONDecodeError:
                    pass

    if not samples:
        print("[SUMMARY] No samples found.")
        return

    total = len(samples)
    labels = Counter(s.get("label") for s in samples)
    vectors = Counter(s.get("vector") for s in samples if s.get("label") == "scam")
    sources = Counter(s.get("source") for s in samples)

    print("\n" + "=" * 60)
    print("GENERATION SUMMARY")
    print("=" * 60)
    print(f"Total samples: {total}")
    print(f"Labels: scam={labels.get('scam', 0)}, safe={labels.get('safe', 0)}")
    safe_pct = labels.get("safe", 0) / total * 100 if total > 0 else 0
    print(f"Safe ratio: {safe_pct:.1f}% (target: 50%)")
    print(f"Sources: Gemini={sources.get('gemini-2.5-flash', 0)}, Ollama={sources.get('llama3.1:8b', 0)}")
    gemini_pct = sources.get("gemini-2.5-flash", 0) / total * 100 if total > 0 else 0
    ollama_pct = sources.get("llama3.1:8b", 0) / total * 100 if total > 0 else 0
    print(f"Source split: Gemini={gemini_pct:.1f}%, Ollama={ollama_pct:.1f}% (target: 75/25)")
    print("\nPer-vector counts (scam only):")
    for vector, target in VECTORS.items():
        count = vectors.get(vector, 0)
        pct = count / target * 100 if target > 0 else 0
        status = "OK" if pct >= 80 else "BELOW TARGET"
        print(f"  {vector:30s}: {count:5d} / {target:5d} ({pct:.0f}%) [{status}]")

    print("\nVectors below 80% of target:")
    below = [(v, vectors.get(v, 0), t) for v, t in VECTORS.items() if vectors.get(v, 0) < t * 0.8]
    if below:
        for v, count, target in below:
            print(f"  {v}: {count}/{target} — re-run script to resume")
    else:
        print("  None — all vectors at or above 80% of target")
    print("=" * 60)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    """Main entry point for synthetic dataset generation."""
    print("=" * 60)
    print("CanaryOS Synthetic Dataset Generator")
    print(f"Target: {TOTAL_SCAM_TARGET} scam + {SAFE_TARGET} safe = {TOTAL_SCAM_TARGET + SAFE_TARGET} total")
    print(f"Output: {OUTPUT_PATH}")
    print("=" * 60)

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        sys.exit("[ERROR] GEMINI_API_KEY not set. Get key from https://aistudio.google.com/apikey")

    client = genai.Client(api_key=api_key)

    # Run all preflight checks before starting
    print("\n[PHASE 1] Running preflight checks...")
    preflight_timing = preflight_checks(client)
    print("[PHASE 1] All preflight checks passed.\n")

    # Load holdout texts for contamination checking
    holdout_texts = load_holdout_texts(HOLDOUT_PATH)
    print(f"[INFO] Loaded {len(holdout_texts)} holdout texts for contamination checking")

    # Load existing samples for resumable generation
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing_samples, scam_counts, label_counts = load_existing_samples(OUTPUT_PATH)
    if existing_samples:
        print(f"[INFO] Resuming: found {len(existing_samples)} existing samples")
        print(f"  Scam vectors: {dict(scam_counts)}")
        print(f"  Labels: {dict(label_counts)}")

    total_generated = 0
    pipeline_start = time.time()

    # Open output file in append mode (supports resumability)
    with open(OUTPUT_PATH, "a", encoding="utf-8") as output_file:

        # Phase 2: Generate scam samples per vector
        print("[PHASE 2] Generating scam samples...")
        for vector, target in VECTORS.items():
            existing_count = scam_counts.get(vector, 0)
            new_count = generate_for_vector(
                vector=vector,
                target=target,
                existing_count=existing_count,
                client=client,
                holdout_texts=holdout_texts,
                output_file=output_file,
                preflight_timing=preflight_timing,
            )
            total_generated += new_count

        # Phase 3: Generate safe class samples
        print("\n[PHASE 3] Generating safe class samples...")
        existing_safe_count = label_counts.get("safe", 0)
        new_safe = generate_safe_samples(
            target=SAFE_TARGET,
            existing_safe_count=existing_safe_count,
            client=client,
            holdout_texts=holdout_texts,
            output_file=output_file,
        )
        total_generated += new_safe

    pipeline_elapsed = time.time() - pipeline_start
    print(f"\n[COMPLETE] Generated {total_generated} new samples in {pipeline_elapsed / 60:.1f} minutes")

    # Post-generation summary
    print_summary(OUTPUT_PATH)


if __name__ == "__main__":
    main()
