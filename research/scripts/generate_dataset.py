"""
generate_dataset.py — Three-model parallel synthetic scam/safe dataset pipeline.

Generates 16K-24K+ labeled training samples across 8 scam vectors using:
  - Gemini 2.5 Flash       (~30% — quality anchor, 10K RPD cap)
  - Gemini 3.1 Flash Lite  (~45% — high-throughput, 150K RPD, parallel-friendly)
  - Ollama Llama 3.1 8B    (~10% — local model diversity, CPU sequential)
  Total Gemini: ~75% (D-05 satisfied). Ollama reduced from 25% → 10% for speed.

Prompt diversity: Parametric prompt builder samples from 7 independent parameter
spaces per call (scam sub-variant, register, length, emotional angle, sender persona,
cultural context, channel), producing millions of unique combinations and eliminating
structural repetition from static template cycling (addresses D-07).

Parallelism: PARALLEL_WORKERS concurrent Gemini API calls via ThreadPoolExecutor,
giving ~10x throughput vs sequential. Full run completes in ~1-2 hours vs 10+ hours.

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
import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from google import genai
from google.genai import types
from pydantic import BaseModel

# Thread-safe lock for file writes (used by parallel workers)
_file_lock = threading.Lock()

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

# Model allocation (D-05: 75% total Gemini maintained)
GEMINI_SHARE = 0.75                         # total Gemini fraction (D-05)
GEMINI_LITE_FRACTION = 0.60                 # 60% of Gemini → Flash Lite (high RPD)
GEMINI_FLASH_FRACTION = 0.40               # 40% of Gemini → Flash 2.5 (quality)
OLLAMA_SHARE = 0.10                         # reduced from 0.25 for speed
OLLAMA_MODEL = "llama3.1:8b"               # D-06: llama3.1:8b

# Gemini model IDs
GEMINI_FLASH_MODEL = "gemini-2.5-flash"
GEMINI_LITE_MODEL = "gemini-3.1-flash-lite-preview"   # 4K RPM, 150K RPD

# Parallelism — concurrent Gemini API calls
PARALLEL_WORKERS = 10
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
# Parametric prompt system — replaces static template cycling (D-07)
# ---------------------------------------------------------------------------
# build_scam_prompt() samples from 7 independent parameter spaces per call:
#   12 sub-variants × 12 registers × 3 lengths × 5 emotional angles ×
#   8 sender personas × 16 cultural contexts × 4 channels
#   = millions of unique prompt combinations per vector, eliminating structural
#   repetition caused by cycling a small fixed template list.

# Scam sub-variants per vector (specific scenario being depicted)
SCAM_SUB_VARIANTS = {
    "crypto_investment": [
        "pig butchering scam — scammer builds a romantic or friendship connection over weeks before steering victim into a fake trading platform",
        "fake cryptocurrency exchange promising guaranteed high returns with a professional-looking website and fake withdrawal testimonials",
        "Bitcoin ATM scam — impersonates a government official or court officer demanding a tax or fine payment in crypto",
        "DeFi yield farming scheme offering unsustainable APY (e.g., 300–800%) through a fraudulent liquidity pool",
        "AI-powered crypto trading bot claiming fully automated daily profits with no risk",
        "fake celebrity or financial influencer endorsement for a new token launch, with the celebrity name mentioned",
        "NFT minting presale scam where the platform collects fees and disappears before delivery",
        "pump-and-dump signal group urging members to buy an obscure token before it 'moons' in hours",
        "fake Initial Coin Offering (ICO) promising early investor returns of 10x–100x",
        "crypto cloud mining contract scam — fake dashboard shows growing balance that can never be withdrawn",
        "fake arbitrage bot promising risk-free profits by exploiting exchange price differences",
        "referral pyramid scheme disguised as a legitimate crypto investment club with tiered bonuses",
    ],
    "romance_grooming": [
        "US Army soldier or officer deployed overseas who fell in love online and needs emergency funds",
        "wealthy widowed engineer or doctor seeking companionship who pivots to a business investment request",
        "'wrong number' text that evolves into a friendship and then pivots to a crypto investment opportunity",
        "offshore oil rig or construction contractor who cannot access their bank and needs a wire transfer",
        "foreign doctor volunteering with an NGO abroad who needs help with unexpected medical or travel bills",
        "business traveler stranded abroad after theft who needs money for a flight home",
        "online dating match who love-bombs the victim rapidly before requesting gift cards or wire transfer",
        "fake celebrity directly messaging fans to build a relationship before requesting fees or donations",
        "divorced parent claiming a child has a sudden medical emergency requiring an urgent money transfer",
        "scammer building weeks of rapport before revealing a 'highly profitable investment opportunity' to join",
        "fake Instagram or TikTok influencer offering exclusive content in exchange for gift card payments",
        "elderly pen-pal scam that migrates online before pivoting to an emergency financial request",
    ],
    "tech_support": [
        "fake Microsoft alert claiming Windows has a critical virus and a helpline number must be called immediately",
        "fake Apple support claiming iCloud was compromised and payment details must be re-entered",
        "fake Google security alert claiming Gmail or Drive was accessed from an unknown device",
        "fake antivirus subscription expiry claiming the device is completely unprotected after auto-renewal failure",
        "fake ISP or router alert claiming the internet connection was hacked and a technician needs device access",
        "fake Amazon AWS billing error claiming the account will be suspended without immediate payment verification",
        "fake bank app security alert claiming the mobile banking app detected a suspicious login attempt",
        "fake Netflix claiming payment failed and the account will be permanently deleted without update",
        "fake PayPal alert claiming an unusual large transaction needs immediate confirmation to be reversed",
        "fake social media platform claiming the account was flagged for policy violations and will be deleted",
        "fake corporate IT helpdesk email claiming an employee's work account was locked for security reasons",
        "fake McAfee or Norton renewal claiming a large charge appeared and a refund is available via a phone number",
    ],
    "government_impersonation": [
        "IRS Revenue Officer claiming back taxes are owed and immediate arrest will occur without gift card payment",
        "Social Security Administration claiming the victim's SSN was used in drug trafficking and will be suspended",
        "USCIS or CBP officer claiming a visa or immigration case has a critical error requiring immediate payment",
        "Medicare representative claiming benefits will be suspended unless the Medicare card number is re-verified",
        "local police or county sheriff claiming there is an active arrest warrant that can be resolved by payment",
        "US Customs and Border Protection claiming a seized package contained illegal goods linked to the recipient",
        "DEA or FBI agent claiming the victim's bank account is linked to a drug cartel investigation",
        "State DMV claiming the driver's license will be suspended within 24 hours for an unpaid fine",
        "IRS audit notice with a fake case number claiming all bank accounts will be frozen by end of business",
        "Social Security overpayment demand claiming thousands must be repaid immediately to avoid prosecution",
        "federal student loan servicer claiming a forgiveness application was rejected and full balance is due",
        "city court claiming missed jury duty will result in immediate arrest unless a fine is paid online today",
    ],
    "phishing": [
        "bank security alert claiming online banking was locked due to suspicious transactions with a re-login link",
        "PayPal suspension notice claiming the account was limited for review and identity must be verified via link",
        "Amazon unauthorized purchase alert asking credit card details to be verified to dispute the charge",
        "Microsoft 365 or Outlook credential expiry claiming the user must re-authenticate via a provided link",
        "Netflix payment failure claiming the subscription will be immediately cancelled without billing update",
        "Apple ID lock claiming suspicious activity was detected and the account must be unlocked via a link",
        "Google Workspace shared document from what appears to be a coworker requiring login credentials to view",
        "Instagram or Facebook account lockout claiming a copyright strike requires identity verification via link",
        "crypto exchange phishing claiming a large withdrawal was initiated and must be cancelled via a link",
        "fake package delivery phishing claiming a customs fee must be paid online to release a held parcel",
        "HR or payroll department phishing targeting employees to verify direct deposit or W-2 information",
        "fake DocuSign or Adobe Sign document requiring login credentials to access a time-sensitive contract",
    ],
    "urgency_payment": [
        "grandparent scam — someone claims to be a grandchild arrested and desperately needs bail money wired",
        "CEO fraud — scammer impersonates a company executive demanding a confidential urgent wire transfer",
        "friend-in-distress scam from an unknown new number claiming a friend was robbed and needs money immediately",
        "utility shutoff threat claiming electricity or water will be cut within one hour without immediate payment",
        "fake landlord demanding an emergency Zelle or Venmo payment for an unexpected fee or eviction threat",
        "kidnapping extortion claiming a family member is held and a ransom must be wired to avoid harm",
        "hospital bill emergency claiming a family member needs urgent surgery requiring upfront payment now",
        "bail bond scam claiming a family member was arrested abroad and needs funds wired urgently",
        "stranded traveler scam from a hacked friend's email claiming their wallet was stolen and they need help",
        "fake debt collector threatening immediate lawsuit and wage garnishment for an unrecognized old debt",
        "emergency home repair scam claiming insurance requires upfront payment within 24 hours or coverage lapses",
        "overdue invoice scam targeting a small business owner with a fake vendor bill demanding same-day payment",
    ],
    "remote_access": [
        "fake tech support asking the victim to install AnyDesk or TeamViewer to fix a Microsoft security breach",
        "fake bank representative asking the victim to install a 'secure verification tool' that is remote access software",
        "fake ISP technician asking the victim to install a 'router diagnostic application' to fix slow internet",
        "fake Amazon refund processor asking the victim to install a 'refund application' to receive an overcharge",
        "fake Microsoft Windows diagnostic requiring a remote session to review detected system errors",
        "fake IT helpdesk instructing an employee to allow a remote desktop session to fix a locked company account",
        "fake Social Security technician asking the victim to install software to protect their benefits account",
        "fake antivirus support asking the victim to allow screen sharing to remove a detected critical threat",
        "fake bank fraud team asking the victim to install a 'fraud investigation app' to secure the account",
        "tech support pop-up with a toll-free number — caller instructs victim to install remote access software",
        "fake government IT asking the victim to install software to 'securely file taxes or verify benefits online'",
        "fake crypto exchange support asking the victim to share their screen to 'verify wallet ownership'",
    ],
    "lottery_reward": [
        "national lottery win claiming the victim's ticket matched the jackpot and processing fees must be paid",
        "UN or international prize draw claiming the victim was randomly selected from a global pool of millions",
        "celebrity giveaway claiming the victim was personally chosen as a social media contest winner",
        "one-millionth-visitor popup claiming the victim won a smartphone or large cash prize, claim within 10 min",
        "scratch card or text-to-win lottery claiming a prize code was found and a registration fee is required",
        "Amazon customer survey reward claiming the victim qualified for a free gift but needs card details for shipping",
        "airline frequent flyer bonus claiming unclaimed miles are expiring today and a fee activates the reward",
        "hotel loyalty reward claiming a free stay was earned but a small redemption fee must be paid to redeem",
        "social media follower giveaway claiming the victim was randomly selected as the sole winner",
        "tax refund windfall claiming the victim is owed a large government unclaimed refund they never filed for",
        "cashback or rebate scam claiming the victim is owed hundreds in unclaimed rewards from past purchases",
        "lottery-backed investment scheme claiming the victim won a prize that must be reinvested to access cash",
    ],
}

# Writing register and language style
REGISTERS = [
    "fluent casual English with natural contractions and minor autocorrect-style typos",
    "non-native English with wrong prepositions, missing articles, and awkward phrase structure",
    "formal professional English with no contractions, corporate vocabulary, and full sentences",
    "urgent clipped language with ALL CAPS on key words and multiple exclamation marks",
    "deliberate misspellings and SMS abbreviations (u, ur, pls, gonna, wanna) throughout",
    "polished business English that reads slightly over-formal or machine-translated",
    "emojis strategically placed to build excitement, urgency, or false legitimacy",
    "warm and personal first-name-basis tone with genuine emotional care expressed",
    "broken English suggesting machine translation from another language",
    "calm, matter-of-fact authoritative tone — stating legal consequences without emotional language",
    "formal opener that gradually shifts to aggressive or threatening language as urgency escalates",
    "heavy use of official-looking formatting: bullet points, case numbers, reference codes, deadlines",
]

# Length targets per channel
LENGTHS = {
    "sms": [
        "under 100 characters",
        "120–160 characters (standard SMS length)",
        "2–3 short sentences fitting within a single SMS",
    ],
    "email": [
        "1 short paragraph with a subject line (3–4 sentences total)",
        "2 paragraphs — first establishes context or authority, second issues the request or threat",
        "formal letter format with greeting, 2-sentence body, and a sign-off with name and title",
    ],
    "whatsapp": [
        "2–3 sentences, casual and direct",
        "4–6 sentences that build rapport or context before pivoting to the request",
        "2–3 short messages separated by line breaks, simulating a real chat exchange",
    ],
    "app_notification": [
        "1 sentence push notification style with a clear action",
        "title line plus 1–2 sentence body in standard notification format",
        "short alert with urgency indicator and an action button label mentioned in brackets",
    ],
}

# Emotional manipulation angles per vector
EMOTIONAL_ANGLES = {
    "crypto_investment": [
        "greed — guaranteed fast profits with specific return percentages cited",
        "FOMO — limited-time exclusive access window closing within hours",
        "social proof — well-known celebrity or influencer endorsement with name mentioned",
        "authority — official-sounding platform name with regulatory-sounding language",
        "reciprocity — victim was personally selected for a private deal not available to the public",
    ],
    "romance_grooming": [
        "love and longing — shared future, deep connection, and the victim being their only hope",
        "sympathy — devastating personal tragedy (death, illness, war injury) creating helplessness",
        "flattery — victim is uniquely beautiful, kind, and unlike anyone the scammer has ever met",
        "guilt — after everything shared, abandoning them now would be a betrayal",
        "reciprocity — I trusted you with my deepest secrets and now need you to trust me in return",
    ],
    "tech_support": [
        "fear — device is actively compromised right now and data is being exfiltrated",
        "urgency — access will be permanently and irreversibly lost within 2 hours without action",
        "authority — official brand name, ticket numbers, employee IDs, and technical jargon",
        "helpfulness — we detected the problem proactively and are reaching out to protect you",
        "loss aversion — all saved files, photos, contacts, and accounts will be permanently deleted",
    ],
    "government_impersonation": [
        "fear of arrest — warrant activates within 2 hours and federal agents will arrive at the door",
        "authority — badge number, federal case number, official agency seal described in text",
        "shame — account is linked to criminal activity; do not tell family members or it gets worse",
        "time pressure — the resolution window closes before end of business today, no extensions",
        "confusion — dense bureaucratic language and legal citations designed to overwhelm",
    ],
    "phishing": [
        "fear — unauthorized account access is happening in real time right now",
        "urgency — account access permanently revoked if not confirmed within 24 hours",
        "loss aversion — subscription history, saved data, and purchase records will all be deleted",
        "authority — impersonates an official brand with exact correct terminology and formatting",
        "curiosity — an important person shared a document or message that requires login to see",
    ],
    "urgency_payment": [
        "panic — a loved one is in physical danger, injured, or in serious legal jeopardy right now",
        "guilt — the victim is the only person who knows and the only one who can help",
        "authority — executive directive, official agency mandate, or law enforcement order",
        "time pressure — the payment window closes in 30 minutes and consequences are irreversible",
        "social obligation — family member or closest friend is counting solely on the victim",
    ],
    "remote_access": [
        "fear — device is actively infected or money is being drained from the account right now",
        "helpfulness — a certified technician is standing by and can resolve this immediately for free",
        "authority — official IT representative from a recognized brand using correct terminology",
        "urgency — the problem will spread to all connected devices within the next hour if not fixed",
        "trust established — scammer references the victim's real account details to appear legitimate",
    ],
    "lottery_reward": [
        "excitement — congratulations, you are a confirmed winner of a specific large dollar amount",
        "FOMO — prize expires or is reallocated to another winner if not claimed within 24 hours",
        "reciprocity — you earned this through your own purchases or activity and it is rightfully yours",
        "social proof — winner status verified, funds are sitting in a holding account waiting for you",
        "greed — a small mandatory processing fee is all that stands between the victim and a windfall",
    ],
}

# Sender personas per vector (who the scammer claims to be)
SENDER_PERSONAS = {
    "crypto_investment": [
        "a close friend who just made a huge profit and wants to share the opportunity exclusively",
        "a licensed investment advisor from a named crypto asset management firm",
        "a well-known celebrity or financial influencer with their social handle mentioned",
        "an automated alert from a named cryptocurrency exchange or trading platform",
        "the admin of an exclusive private trading or investment group",
        "a stranger who accidentally messaged the wrong number but keeps engaging",
        "a former coworker or college classmate reconnecting through social media",
        "an anonymous market insider sharing early signals before a major price move",
    ],
    "romance_grooming": [
        "a US Army soldier or Special Forces officer currently deployed in a conflict zone",
        "a widowed petroleum engineer on a remote offshore oil rig",
        "a foreign doctor volunteering with Doctors Without Borders or UNICEF",
        "an attractive stranger who matched on a mainstream dating app",
        "a wealthy entrepreneur or tech investor who travels constantly for business",
        "a celebrity or public figure who appears to have messaged the victim directly",
        "a recently divorced single parent dealing with a custody battle and financial stress",
        "a pen pal who moved contact from a letter-writing platform to WhatsApp or email",
    ],
    "tech_support": [
        "Microsoft Security Team or Certified Microsoft Support Technician",
        "Apple Security Response Team or iCloud Account Protection",
        "Google Account Protection or Gmail Security Team",
        "ISP Technical Support or Network Security Operations Center",
        "McAfee, Norton, or Avast Customer Support and Renewal Team",
        "Amazon Customer Service or AWS Account Management",
        "bank IT Security Department or Fraud Prevention Team",
        "Google Workspace or Microsoft 365 IT Helpdesk",
    ],
    "government_impersonation": [
        "IRS Revenue Officer with a badge number and federal case reference",
        "Social Security Administration agent with a supervisor contact number",
        "US Customs and Border Protection officer at a named port of entry",
        "Medicare or Medicaid benefits representative",
        "local county sheriff's department with an active warrant number",
        "FBI or DEA special agent with a federal investigation case number",
        "USCIS or Department of Homeland Security compliance officer",
        "State Department of Motor Vehicles enforcement division",
    ],
    "phishing": [
        "the security or fraud team of the impersonated brand (Chase, PayPal, Apple, etc.)",
        "corporate IT or helpdesk department sending to a work email address",
        "a trusted contact whose account was compromised and is unknowingly forwarding a malicious link",
        "an automated system security alert with no personal sender name shown",
        "HR or payroll department using an internal-sounding domain name",
        "a legal or compliance officer handling a time-sensitive regulatory matter",
    ],
    "urgency_payment": [
        "a grandchild or young adult family member who was just arrested",
        "a company CEO or CFO demanding a strictly confidential same-day wire transfer",
        "a close friend texting from an unfamiliar new number after losing their phone",
        "a utility company or service provider threatening immediate service disconnection",
        "a landlord or property manager demanding emergency payment via Zelle or Venmo",
        "an anonymous caller claiming to hold a family member and demanding ransom",
    ],
    "remote_access": [
        "Microsoft Certified Support Technician with a ticket number",
        "bank fraud investigation specialist calling about a detected breach",
        "ISP field technician dispatched to address a network security incident",
        "Amazon refund processing department following up on a large overcharge",
        "antivirus or cybersecurity company customer support and remediation agent",
        "corporate IT helpdesk or system administrator reaching out proactively",
        "Social Security Administration IT department protecting the victim's benefits account",
    ],
    "lottery_reward": [
        "national lottery prize distribution authority with an official reference number",
        "UN International Prize Committee or global sweepstakes organization representative",
        "a celebrity or brand ambassador personally confirming the winner",
        "automated prize fulfillment center with a claim reference and deadline",
        "airline or hotel loyalty rewards department notifying about expiring miles or nights",
        "major retailer customer rewards or cashback department",
    ],
}

# Cultural and demographic contexts — adds geographic and audience diversity
CULTURAL_CONTEXTS = [
    "targeting an adult in the United States",
    "targeting an adult in the United Kingdom",
    "targeting an adult in Canada",
    "targeting an adult in Australia or New Zealand",
    "targeting a recent immigrant to the US who may be anxious about deportation or legal status",
    "targeting a retiree over 65 who is less familiar with current digital scam tactics",
    "targeting a college student under financial stress with student loan debt",
    "targeting a small business owner responsible for payroll and vendor payments",
    "targeting a job seeker who recently posted their resume publicly on LinkedIn or Indeed",
    "targeting a homeowner who recently listed their property or vehicle for sale online",
    "written in a style suggesting the scammer is based in West Africa — characteristic phrases and warmth",
    "written in a style suggesting Eastern European origin — characteristic grammar patterns and directness",
    "written in a style suggesting South Asian origin — characteristic honorifics and phrasing",
    "targeting someone in a rural area with limited prior exposure to online fraud",
    "targeting a working parent managing multiple financial responsibilities with limited time to verify claims",
    "targeting someone who recently experienced a job loss, divorce, or financial setback",
]


def build_scam_prompt(vector: str, channel: str) -> str:
    """Build a unique scam training prompt by sampling from 7 independent parameter spaces.

    Each call produces a different combination from millions of possibilities,
    eliminating structural repetition caused by static template cycling (D-07).
    """
    sub_variant = random.choice(SCAM_SUB_VARIANTS[vector])
    register = random.choice(REGISTERS)
    length = random.choice(LENGTHS[channel])
    emotion = random.choice(EMOTIONAL_ANGLES[vector])
    persona = random.choice(SENDER_PERSONAS[vector])
    context = random.choice(CULTURAL_CONTEXTS)

    return (
        f"Write a synthetic example message for a scam detection training dataset. "
        f"Scenario: {sub_variant}. "
        f"Channel: {channel}. "
        f"Sender claims to be: {persona}. "
        f"Primary manipulation angle: {emotion}. "
        f"Writing style: {register}. "
        f"Demographic context: {context}. "
        f"Length: {length}. "
        f"Write the actual message the scammer would send, with realistic specific details "
        f"(dollar amounts, platform names, case numbers, dates, URLs where appropriate). "
        f"Return JSON with fields: text (the message text only), "
        f"label (='scam'), vector (='{vector}'), channel (='{channel}')."
    )


# ---------------------------------------------------------------------------
# Safe class parametric prompt system
# ---------------------------------------------------------------------------

# Hard negative variants per category (domain-matched to scam vectors — D-11)
# These are the most confusable legitimate messages that a scam detector must not flag.
SAFE_HARD_NEG_VARIANTS = {
    "bank_alert": [
        "a real bank fraud alert asking if the customer authorized a recent charge, with merchant name and amount",
        "a legitimate credit card declined notification with the merchant name and exact declined amount",
        "a real bank low-balance threshold alert showing the current balance",
        "a legitimate new device login confirmation with device type and approximate location",
        "a real bank statement now available notification with the account last four digits",
        "a legitimate large purchase confirmation alert sent to verify an unusual but real transaction",
        "a real bank account transfer confirmation with recipient initials and the transferred amount",
        "a legitimate bank scheduled maintenance notification with specific start and end times",
    ],
    "delivery": [
        "a real USPS out-for-delivery SMS with a partial tracking number",
        "a real FedEx estimated delivery SMS with a time window and tracking reference",
        "a real UPS signature required notification with the tracking number and address",
        "a real Amazon order shipped notification with the order number and estimated delivery date",
        "a real DHL customs cleared notification with tracking and expected delivery day",
        "a real package delivered notification with a timestamp and drop-off location description",
        "a real delivery attempt failed notice with redelivery instructions and pickup location",
        "a real USPS Informed Delivery email confirming expected mail pieces arriving today",
    ],
    "two_factor_auth": [
        "a real 2FA SMS code for logging into an online account",
        "a real bank OTP SMS for approving a wire or ACH transfer",
        "a real app push notification requesting approval or denial of a new login attempt",
        "a real email from a major service about a sign-in from a new device with device name and city",
        "a real account recovery code SMS triggered by a legitimate password reset request",
        "a real email confirmation that a new phone number was added to an account",
        "a real backup verification code SMS for an authenticator app setup",
    ],
    "medical_pharmacy": [
        "a real pharmacy prescription ready for pickup SMS with the pharmacy name and store location",
        "a real doctor appointment reminder SMS with the physician name and clinic address",
        "a real lab results available notification from a patient portal with the portal name",
        "a real prescription auto-refill shipped notification with the medication category",
        "a real medical insurance pre-authorization approval for a scheduled procedure",
        "a real telehealth appointment confirmation with the date, time, and video join link",
        "a real vaccination or booster reminder from a health system with appointment details",
    ],
    "legitimate_tech": [
        "a real app update available notification from the App Store or Google Play",
        "a real software license renewal reminder with the exact annual price and renewal date",
        "a real scheduled maintenance downtime notification from a named cloud service",
        "a real password successfully changed confirmation with the timestamp it occurred",
        "a real account email address change confirmation asking to contact support if not requested",
        "a real storage quota warning from a cloud service showing current usage vs. limit",
        "a real browser or operating system automatic update completed notification",
    ],
    "legitimate_government": [
        "a real vehicle registration renewal reminder from the DMV with the fee amount and deadline",
        "a real USPS mail hold successfully scheduled confirmation with dates",
        "a real jury duty summons excerpt with the courthouse address and required reporting date",
        "a real voter registration confirmation with the county election board name",
        "a real property tax payment confirmation with the parcel number and amount paid",
        "a real passport renewal reminder from the State Department with the expiry date shown",
        "a real census completion confirmation with a reference number",
    ],
}

# Normal transactional safe variants (clearly legitimate, broad coverage)
SAFE_TRANSACTIONAL_VARIANTS = [
    "an order confirmation SMS with the order number, item summary, and delivery estimate",
    "a shipping confirmation email with the tracking number and carrier name",
    "a return label issued confirmation with the return reason and refund timeline",
    "a refund processed notification with the amount and the payment method it was returned to",
    "a post-purchase product review request from a verified retailer",
    "an airline booking confirmation SMS with the flight number, departure time, and gate",
    "a hotel check-in instructions email with arrival time, room type, and building access details",
    "a ride-share driver en-route notification with driver name, car model, plate, and ETA",
    "a flight delay notification with the updated departure time and new gate",
    "a car rental reservation confirmation with pickup location, vehicle class, and rate",
    "a calendar meeting reminder with the meeting title, organizer name, time, and video join link",
    "a job application acknowledgment email confirming receipt with the role title mentioned",
    "a job interview scheduled confirmation with interviewer name, time, format, and location",
    "a professional networking connection request notification with the sender's name and current title",
    "a subscription renewal confirmation email with the service name and exact amount charged",
    "a subscription cancellation confirmation with the effective end date",
    "a free trial ending reminder with the plan it converts to and the upcoming monthly charge",
    "a gym or fitness class booking confirmation with the class name, instructor, and time",
    "a restaurant reservation confirmation with date, time, party size, and restaurant name",
    "a hair salon or spa appointment reminder with the stylist or technician name and location",
    "a grocery delivery confirmed notification with the estimated delivery window and item count",
    "a utility bill payment confirmation SMS with the account number last four digits and amount",
    "a mortgage or rent payment received confirmation with the posting date and confirmation number",
    "a payroll direct deposit notification with the net amount and depositing bank last four digits",
    "a credit score change notification from a monitoring service showing the new score and change",
    "a school assignment or grade posted notification to a parent with the student's name and class",
    "a university enrollment confirmation for an upcoming term with the start date and student ID",
    "an online course completion certificate notification with the course title",
    "a library overdue book reminder with the book title, due date, and daily fee amount",
    "an HOA monthly meeting agenda notification with date, time, and location",
    "a parking permit renewal reminder with the current expiry date and renewal cost",
    "a health insurance claim approved notification with the claim number and approved amount",
    "a 401k or investment account statement now available notification with the current portfolio value",
    "a home internet service scheduled installation appointment confirmation with the time window",
    "a package pickup ready notification from a retail store click-and-collect order",
    "a loyalty points balance update notification showing the current total and next reward threshold",
]

# Named services and senders used in safe prompts for realism
SAFE_SERVICE_NAMES = [
    "Chase", "Wells Fargo", "Bank of America", "Citibank", "Capital One", "US Bank",
    "USPS", "FedEx", "UPS", "Amazon", "DHL", "Instacart", "Shipt",
    "Google", "Apple", "Microsoft", "Spotify", "Netflix", "Hulu", "Disney+",
    "CVS Pharmacy", "Walgreens", "Rite Aid", "Kaiser Permanente", "Aetna",
    "Delta Airlines", "United Airlines", "Southwest Airlines", "American Airlines",
    "Uber", "Lyft", "DoorDash", "Grubhub", "Instacart",
    "LinkedIn", "Indeed", "Glassdoor", "Zoom", "Slack", "Microsoft Teams",
    "Verizon", "AT&T", "T-Mobile", "Comcast Xfinity", "Spectrum",
    "State Farm", "Geico", "Progressive", "Allstate",
    "Planet Fitness", "Equinox", "Marriott Bonvoy", "Hilton Honors",
]

# Recipient contexts for safe messages
SAFE_RECIPIENT_CONTEXTS = [
    "sent to a customer in the United States",
    "sent to a customer in Canada",
    "sent to a small business owner",
    "sent to a college student managing their first bank account",
    "sent to a working professional",
    "sent to a retiree",
    "sent to a parent managing household expenses",
    "sent to a frequent traveler with airline and hotel loyalty accounts",
]


def build_safe_prompt(is_hard_negative: bool = False) -> str:
    """Build a unique safe-class training prompt by sampling from parameter spaces.

    Hard negatives are the most confusable legitimate messages — domain-matched
    to scam vectors per D-11. Normal samples cover broad transactional categories.
    """
    service = random.choice(SAFE_SERVICE_NAMES)
    recipient_context = random.choice(SAFE_RECIPIENT_CONTEXTS)

    if is_hard_negative:
        category = random.choice(list(SAFE_HARD_NEG_VARIANTS.keys()))
        variant = random.choice(SAFE_HARD_NEG_VARIANTS[category])
        # Match channel to category for realism
        if category in ("two_factor_auth", "bank_alert", "delivery", "medical_pharmacy"):
            channel = random.choice(["sms", "app_notification"])
        elif category in ("legitimate_government", "legitimate_tech"):
            channel = random.choice(["email", "sms"])
        else:
            channel = random.choice(CHANNELS)
    else:
        variant = random.choice(SAFE_TRANSACTIONAL_VARIANTS)
        channel = random.choice(CHANNELS)

    length = random.choice(LENGTHS[channel])

    return (
        f"Generate a realistic, trustworthy (non-scam) message for a scam detection training dataset. "
        f"This represents: {variant}. "
        f"Sender or service: {service} (or a realistic equivalent in the same category). "
        f"Recipient: {recipient_context}. "
        f"Channel: {channel}. "
        f"Length: {length}. "
        f"Include specific realistic details (order numbers, dollar amounts, tracking numbers, "
        f"dates, names). The message must be factual and non-urgent with no vague CTAs, no requests "
        f"for sensitive information, and no suspicious links. "
        f"Return JSON with fields: text (the message text only), "
        f"label (='safe'), vector (='safe'), channel (='{channel}')."
    )

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

def generate_gemini(prompt: str, client: genai.Client, max_retries: int = 5) -> dict | None:
    """Generate one sample via Gemini 2.5 Flash with exponential backoff."""
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model=GEMINI_FLASH_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_json_schema=ScamSample.model_json_schema(),
                ),
            )
            sample = json.loads(response.text)
            sample["source"] = GEMINI_FLASH_MODEL
            return sample
        except Exception as e:
            err = str(e)
            if "429" in err or "RESOURCE_EXHAUSTED" in err or "503" in err or "UNAVAILABLE" in err:
                wait = min(2 ** attempt, 32)  # 1s, 2s, 4s, 8s, 16s capped at 32s
                print(f"  Gemini Flash rate/unavailable, retrying in {wait}s... ({err[:80]})")
                time.sleep(wait)
            else:
                print(f"  Gemini Flash error: {e}")
                return None
    print(f"  Gemini Flash failed after {max_retries} retries")
    return None


def generate_gemini_lite(prompt: str, client: genai.Client, max_retries: int = 5) -> dict | None:
    """Generate one sample via Gemini 3.1 Flash Lite with exponential backoff."""
    for attempt in range(max_retries):
        try:
            response = client.models.generate_content(
                model=GEMINI_LITE_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_json_schema=ScamSample.model_json_schema(),
                ),
            )
            sample = json.loads(response.text)
            sample["source"] = GEMINI_LITE_MODEL
            return sample
        except Exception as e:
            err = str(e)
            if "429" in err or "RESOURCE_EXHAUSTED" in err or "503" in err or "UNAVAILABLE" in err:
                wait = min(2 ** attempt, 32)
                print(f"  Gemini Lite rate/unavailable, retrying in {wait}s... ({err[:80]})")
                time.sleep(wait)
            else:
                print(f"  Gemini Lite error: {e}")
                return None
    print(f"  Gemini Lite failed after {max_retries} retries")
    return None


def _parallel_gemini_batch(
    tasks: list[tuple[str, str]],
    client: genai.Client,
) -> list[dict | None]:
    """
    Run a batch of Gemini generation tasks in parallel via ThreadPoolExecutor.
    tasks: list of (prompt, model_type) where model_type is "flash" or "lite".
    Returns results in same order as input; None for any failed call.
    """
    def _run_one(args):
        prompt, model_type = args
        if model_type == "lite":
            return generate_gemini_lite(prompt, client)
        return generate_gemini(prompt, client)

    with ThreadPoolExecutor(max_workers=PARALLEL_WORKERS) as executor:
        return list(executor.map(_run_one, tasks))


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
    print(f"[PREFLIGHT OK] Gemini Flash: {5 - gemini_failures}/5 test prompts succeeded")

    # Check 6: Gemini Lite preflight test
    print("[PREFLIGHT] Testing Gemini Lite (1 sample)...")
    lite_test_prompt = (
        "Write an example SMS that a scam awareness educator would use to demonstrate a "
        "phishing scam. Return JSON with fields: text (the message), "
        "label (='scam'), vector (='phishing'), channel (='sms')."
    )
    lite_result = generate_gemini_lite(lite_test_prompt, client)
    if lite_result is None:
        print("[WARNING] Gemini Lite preflight failed — Lite quota will fall back to Flash")
    else:
        print(f"[PREFLIGHT OK] Gemini Lite: {str(lite_result.get('text', ''))[:60]}...")

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

    # Compute per-model targets
    ollama_share = OLLAMA_SHARE
    if vector in ("romance_grooming", "government_impersonation"):
        # Increase Ollama share for safety-filter-sensitive vectors (Pitfall 1.4)
        ollama_share = min(OLLAMA_SHARE * 2.5, 0.25)

    ollama_target = int(remaining * ollama_share)
    gemini_total = remaining - ollama_target
    flash_target = int(gemini_total * GEMINI_FLASH_FRACTION)
    lite_target = gemini_total - flash_target

    generated = 0
    start_time = time.time()
    flash_done = 0
    lite_done = 0
    ollama_done = 0
    skipped = 0

    # --- Parallel Gemini generation (Flash + Lite interleaved in each batch) ---
    while flash_done < flash_target or lite_done < lite_target:
        flash_need = flash_target - flash_done
        lite_need = lite_target - lite_done

        # Build batch: assign each slot to flash or lite proportionally
        batch_tasks = []
        flash_in_batch = 0
        lite_in_batch = 0
        for _ in range(min(PARALLEL_WORKERS, flash_need + lite_need)):
            f_avail = flash_need - flash_in_batch
            l_avail = lite_need - lite_in_batch
            if f_avail > 0 and l_avail > 0:
                use_flash = random.random() < GEMINI_FLASH_FRACTION
            else:
                use_flash = f_avail > 0
            model_type = "flash" if use_flash else "lite"
            batch_tasks.append((build_scam_prompt(vector, random.choice(CHANNELS)), model_type))
            if use_flash:
                flash_in_batch += 1
            else:
                lite_in_batch += 1

        results = _parallel_gemini_batch(batch_tasks, client)

        for result, (_, model_type) in zip(results, batch_tasks):
            if result and validate_sample(result) and not is_contaminated(result.get("text", ""), holdout_texts):
                result["vector"] = vector
                result["label"] = "scam"
                output_file.write(json.dumps(result) + "\n")
                output_file.flush()
                if model_type == "flash":
                    flash_done += 1
                else:
                    lite_done += 1
                generated += 1
            else:
                skipped += 1

        total_done = flash_done + lite_done + ollama_done
        if total_done > 0 and total_done % 50 == 0:
            elapsed = time.time() - start_time
            rate = total_done / elapsed if elapsed > 0 else 1
            eta_seconds = (remaining - total_done) / rate if rate > 0 else 0
            print(
                f"  [{total_done}/{remaining} {vector}] ETA: {eta_seconds / 3600:.2f}h | "
                f"Flash: {flash_done}, Lite: {lite_done}, Ollama: {ollama_done}, Skipped: {skipped}"
            )

    # --- Sequential Ollama generation ---
    while ollama_done < ollama_target:
        prompt = build_scam_prompt(vector, random.choice(CHANNELS))
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

        total_done = flash_done + lite_done + ollama_done
        if total_done > 0 and total_done % 50 == 0:
            elapsed = time.time() - start_time
            rate = total_done / elapsed if elapsed > 0 else 1
            eta_seconds = (remaining - total_done) / rate if rate > 0 else 0
            print(
                f"  [{total_done}/{remaining} {vector}] ETA: {eta_seconds / 3600:.2f}h | "
                f"Flash: {flash_done}, Lite: {lite_done}, Ollama: {ollama_done}, Skipped: {skipped}"
            )

    elapsed = time.time() - start_time
    print(
        f"[DONE] {vector}: {generated} new samples in {elapsed:.0f}s "
        f"(Flash: {flash_done}, Lite: {lite_done}, Ollama: {ollama_done}, Skipped: {skipped})"
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

    # Per-model targets: OLLAMA_SHARE for Ollama, rest split Flash/Lite (D-05)
    ollama_target = int(remaining * OLLAMA_SHARE)
    gemini_total = remaining - ollama_target
    flash_target = int(gemini_total * GEMINI_FLASH_FRACTION)
    lite_target = gemini_total - flash_target

    generated = 0
    start_time = time.time()
    flash_done = 0
    lite_done = 0
    ollama_done = 0
    hard_neg_done = 0
    normal_done = 0
    skipped = 0

    # --- Parallel Gemini generation ---
    # Hard negatives are filled first within each batch; normals fill the remainder.
    while flash_done < flash_target or lite_done < lite_target:
        flash_need = flash_target - flash_done
        lite_need = lite_target - lite_done

        batch_tasks = []  # (prompt, model_type, is_hard_neg)
        flash_in_batch = 0
        lite_in_batch = 0
        hard_neg_in_batch = 0

        for _ in range(min(PARALLEL_WORKERS, flash_need + lite_need)):
            f_avail = flash_need - flash_in_batch
            l_avail = lite_need - lite_in_batch
            if f_avail > 0 and l_avail > 0:
                use_flash = random.random() < GEMINI_FLASH_FRACTION
            else:
                use_flash = f_avail > 0
            model_type = "flash" if use_flash else "lite"

            is_hard_neg = (hard_neg_done + hard_neg_in_batch) < hard_negative_target
            prompt = build_safe_prompt(is_hard_negative=is_hard_neg)
            batch_tasks.append((prompt, model_type, is_hard_neg))
            if use_flash:
                flash_in_batch += 1
            else:
                lite_in_batch += 1
            if is_hard_neg:
                hard_neg_in_batch += 1

        api_tasks = [(p, mt) for p, mt, _ in batch_tasks]
        results = _parallel_gemini_batch(api_tasks, client)

        for result, (_, model_type, is_hard_neg) in zip(results, batch_tasks):
            if result and validate_sample(result) and not is_contaminated(result.get("text", ""), holdout_texts):
                result["vector"] = "safe"
                result["label"] = "safe"
                output_file.write(json.dumps(result) + "\n")
                output_file.flush()
                if model_type == "flash":
                    flash_done += 1
                else:
                    lite_done += 1
                if is_hard_neg:
                    hard_neg_done += 1
                else:
                    normal_done += 1
                generated += 1
            else:
                skipped += 1

        total_done = flash_done + lite_done + ollama_done
        if total_done > 0 and total_done % 50 == 0:
            elapsed = time.time() - start_time
            rate = total_done / elapsed if elapsed > 0 else 1
            eta_seconds = (remaining - total_done) / rate if rate > 0 else 0
            print(
                f"  [{total_done}/{remaining} safe] ETA: {eta_seconds / 3600:.2f}h | "
                f"Flash: {flash_done}, Lite: {lite_done}, Ollama: {ollama_done}, "
                f"HardNeg: {hard_neg_done}, Skipped: {skipped}"
            )

    # --- Sequential Ollama generation ---
    while ollama_done < ollama_target:
        is_hard_neg = hard_neg_done < hard_negative_target
        prompt = build_safe_prompt(is_hard_negative=is_hard_neg)
        sample = generate_ollama(prompt)
        if sample and validate_sample(sample) and not is_contaminated(sample.get("text", ""), holdout_texts):
            sample["vector"] = "safe"
            sample["label"] = "safe"
            output_file.write(json.dumps(sample) + "\n")
            output_file.flush()
            ollama_done += 1
            if is_hard_neg:
                hard_neg_done += 1
            else:
                normal_done += 1
            generated += 1
        else:
            skipped += 1

        total_done = flash_done + lite_done + ollama_done
        if total_done > 0 and total_done % 50 == 0:
            elapsed = time.time() - start_time
            rate = total_done / elapsed if elapsed > 0 else 1
            eta_seconds = (remaining - total_done) / rate if rate > 0 else 0
            print(
                f"  [{total_done}/{remaining} safe] ETA: {eta_seconds / 3600:.2f}h | "
                f"Flash: {flash_done}, Lite: {lite_done}, Ollama: {ollama_done}, "
                f"HardNeg: {hard_neg_done}, Skipped: {skipped}"
            )

    elapsed = time.time() - start_time
    print(
        f"[DONE] safe class: {generated} new samples in {elapsed:.0f}s "
        f"(Flash: {flash_done}, Lite: {lite_done}, Ollama: {ollama_done}, "
        f"HardNeg: {hard_neg_done}, Normal: {normal_done}, Skipped: {skipped})"
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
    flash_count = sources.get(GEMINI_FLASH_MODEL, 0)
    lite_count = sources.get(GEMINI_LITE_MODEL, 0)
    ollama_count = sources.get("llama3.1:8b", 0)
    gemini_total_count = flash_count + lite_count
    print(f"Sources: Flash={flash_count}, Lite={lite_count}, Gemini total={gemini_total_count}, Ollama={ollama_count}")
    gemini_pct = gemini_total_count / total * 100 if total > 0 else 0
    flash_pct = flash_count / total * 100 if total > 0 else 0
    lite_pct = lite_count / total * 100 if total > 0 else 0
    ollama_pct = ollama_count / total * 100 if total > 0 else 0
    print(f"Source split: Gemini={gemini_pct:.1f}% (Flash={flash_pct:.1f}%+Lite={lite_pct:.1f}%), Ollama={ollama_pct:.1f}% (target: 75/10)")
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
