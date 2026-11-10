"""
Synthetic / Benchmark dataset builder adhering to the Bitext Customer Support
and Banking77 taxonomy mapped to 7 target categories:
PAYMENT, REFUND, DELIVERY, ACCOUNT, TECHNICAL, PRODUCT, OTHER.
"""
import csv
import random
from pathlib import Path

random.seed(42)

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "customer_support_data.csv"

CATEGORIES = {
    "PAYMENT": {
        "intents": ["card_declined", "double_charge", "payment_failed", "invoice_query", "update_billing"],
        "templates": [
            "My card was declined when trying to pay {amount} for order {order_id}. Transaction ref is {txn_id}.",
            "I noticed a double charge of {amount} on my credit card on {date} with reference {txn_id}.",
            "Payment failed during checkout for {product} with transaction ID {txn_id}.",
            "Can you send me the tax invoice for payment of {amount} processed on {date}?",
            "My payment of {amount} is showing pending for order {order_id} since {date}.",
            "The checkout system gave an error code PAY_ERR_301 when charging {amount}.",
            "I need to update my billing card before the automatic renewal of {amount} on {date}.",
            "Why was I billed {amount} without authorization? Transaction ID is {txn_id}.",
            "The subscription payment of {amount} for {product} failed on {date}.",
            "My bank confirmed payment was deducted for {amount} but order {order_id} shows unpaid.",
        ],
        "default_priority": "HIGH",
        "default_sentiment": "NEGATIVE",
    },
    "REFUND": {
        "intents": ["request_refund", "check_refund_status", "cancel_order_refund", "damaged_item_refund", "dispute_charge"],
        "templates": [
            "I want a full refund of {amount} for order {order_id} which arrived broken.",
            "Can you please check the status of my refund for {product}? Reference {txn_id}.",
            "I cancelled order {order_id} on {date} and have not received my {amount} refund yet.",
            "The product {product} does not match the description. Please issue a refund to my account.",
            "I am requesting a refund of {amount} for transaction {txn_id} processed on {date}.",
            "Where is my money back? You promised a refund for order {order_id} within 5 business days.",
            "I returned {product} on {date}. When will the refund of {amount} be credited?",
            "Please cancel my subscription for {product} and refund the recent charge of {amount}.",
            "I have not received my refund of {amount} for order {order_id}. Please expedite.",
            "Customer support approved my refund on {date} under ref {txn_id}, but no funds received.",
        ],
        "default_priority": "MEDIUM",
        "default_sentiment": "NEGATIVE",
    },
    "DELIVERY": {
        "intents": ["track_shipment", "delivery_delay", "wrong_address", "missing_package", "damaged_shipment"],
        "templates": [
            "Where is my package for order {order_id}? Tracking has not updated since {date}.",
            "My delivery for {product} was supposed to arrive yesterday, but it is delayed.",
            "I need to change the shipping address for order {order_id} before it dispatches.",
            "Tracking code says order {order_id} was delivered on {date}, but I received nothing.",
            "The courier failed to deliver {product} to my address today. Order number {order_id}.",
            "Can you give me an estimated delivery date for order {order_id} containing {product}?",
            "The package for order {order_id} arrived damaged and torn on {date}.",
            "Customs is holding my package with tracking number {order_id}. What documents are needed?",
            "Has order {order_id} shipped yet? It was placed on {date}.",
            "My order {order_id} was shipped to the wrong postal code. Please reroute immediately.",
        ],
        "default_priority": "MEDIUM",
        "default_sentiment": "NEGATIVE",
    },
    "ACCOUNT": {
        "intents": ["password_reset", "account_locked", "two_factor_issue", "update_profile", "delete_account"],
        "templates": [
            "I cannot log into my account. The password reset email is never sent to my email address.",
            "My account has been locked after entering the wrong password three times on {date}.",
            "I lost my phone and cannot receive the 2FA verification code to sign into my dashboard.",
            "How do I update my registered email and phone number on my profile?",
            "I suspect unauthorized access to my account on {date}. Please secure it immediately.",
            "I am getting an 'invalid credentials' error even though I just reset my password.",
            "Please delete my account and purge all personal data associated with my profile.",
            "Unable to sign in using SSO / Google auth on our enterprise account.",
            "My session keeps expiring every two minutes while using the platform.",
            "Cannot access my organization workspace after role permissions changed on {date}.",
        ],
        "default_priority": "HIGH",
        "default_sentiment": "NEGATIVE",
    },
    "TECHNICAL": {
        "intents": ["api_error", "server_timeout", "bug_report", "crash_exception", "integration_failure"],
        "templates": [
            "Receiving HTTP 500 Internal Server Error when calling the /api/v1/tickets endpoint.",
            "Our webhook integration stopped receiving events on {date}. Error code E_CONN_RESET.",
            "The application crashes with an unhandled exception when uploading files larger than 10MB.",
            "Database queries are timing out with 504 Gateway Timeout during batch exports.",
            "The SDK throws a null pointer exception when initializing client with API key.",
            "CORS policy error when connecting frontend client to the API backend.",
            "Getting rate limit 429 Too Many Requests even though our traffic is below 10 req/sec.",
            "SSL certificate handshake failed for our custom domain endpoint on {date}.",
            "WebSocket connection drops repeatedly every 30 seconds with code 1006.",
            "Bug report: the pagination cursor returns duplicate records on page 3.",
        ],
        "default_priority": "HIGH",
        "default_sentiment": "NEGATIVE",
    },
    "PRODUCT": {
        "intents": ["product_specification", "compatibility_query", "feature_request", "pricing_inquiry", "user_guide"],
        "templates": [
            "Does {product} support PostgreSQL version 16 and multi-region replication?",
            "What are the hardware system requirements and memory footprint for {product}?",
            "Is {product} compatible with Docker Desktop and Kubernetes clusters?",
            "Can we export reporting data to CSV or Excel directly from {product}?",
            "We would like to request dark mode support and custom themes in the next update.",
            "What is the difference in features between the Starter and Enterprise tiers of {product}?",
            "How many concurrent users are supported on a single instance of {product}?",
            "Does {product} offer end-to-end encryption for stored customer ticket data?",
            "Can {product} integrate with Slack, Microsoft Teams, and webhook alerts?",
            "Where can I find the official API documentation and code samples for {product}?",
        ],
        "default_priority": "LOW",
        "default_sentiment": "NEUTRAL",
    },
    "OTHER": {
        "intents": ["general_inquiry", "partnership_request", "feedback", "human_agent", "spam_unknown"],
        "templates": [
            "Hello, I would like to speak to a representative regarding partnership opportunities.",
            "Great job on the new release! The system performance has significantly improved.",
            "Can someone from sales call me back to discuss annual enterprise licensing?",
            "I have general feedback about the onboarding documentation.",
            "Is your office open on public holidays and weekends?",
            "Please transfer this inquiry to a human agent.",
            "Just testing the contact form to verify message delivery.",
            "Where is your corporate headquarters located?",
            "Can you sponsor our upcoming tech conference on {date}?",
            "Random inquiry regarding your privacy policy terms and compliance certifications.",
        ],
        "default_priority": "LOW",
        "default_sentiment": "POSITIVE",
    },
}

ORDERS = ["ORD-48291", "ORD-10928", "ORD-77312", "ORD-89210", "ORD-33412", "#58291", "#10928", "#77312"]
AMOUNTS = ["$49.99", "$99.50", "$150.00", "$450.00", "€35.50", "€120.00", "£85.00", "250 USD", "75 EUR"]
DATES = ["yesterday", "2026-11-04", "Nov 10", "Nov 12", "3 days ago", "last Friday", "October 28th", "today"]
PRODUCTS = ["Cloud Backup Pro", "SmartHub X1", "Enterprise Gateway", "Wireless Pro Headset", "OmniSensor 2.0", "Security Suite Pro"]
TXNS = ["TXN-88192", "TXN-90214", "ch_3M4K281", "ch_9X2L891", "PAY-9921", "ref#4412", "ref#88219"]

def generate_dataset():
    records = []
    
    for category, cat_data in CATEGORIES.items():
        templates = cat_data["templates"]
        intents = cat_data["intents"]
        
        # Generate variations for each template
        for _ in range(12):  # Creates ~120 samples per category (total ~840 samples)
            for i, template in enumerate(templates):
                text = template.format(
                    order_id=random.choice(ORDERS),
                    amount=random.choice(AMOUNTS),
                    date=random.choice(DATES),
                    product=random.choice(PRODUCTS),
                    txn_id=random.choice(TXNS),
                )
                
                # Add natural noise variations occasionally
                if random.random() < 0.2:
                    text = text.lower()
                elif random.random() < 0.1:
                    text = "URGENT: " + text
                
                intent = intents[i % len(intents)]
                
                # Derive realistic priority
                priority = cat_data["default_priority"]
                if "urgent" in text.lower() or "immediately" in text.lower() or "$450" in text:
                    priority = "URGENT" if priority == "HIGH" else "HIGH"
                
                records.append({
                    "text": text,
                    "category": category,
                    "intent": intent,
                    "priority": priority,
                    "sentiment": cat_data["default_sentiment"],
                })

    # Shuffle dataset
    random.shuffle(records)

    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_PATH, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["text", "category", "intent", "priority", "sentiment"])
        writer.writeheader()
        writer.writerows(records)

    print(f"[OK] Generated {len(records)} customer support records at {DATA_PATH}")

if __name__ == "__main__":
    generate_dataset()
