import os
import re
import json
import time
import logging
import requests
from datetime import datetime, timedelta

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Configuration from environment
NYLAS_API_KEY = os.environ.get('NYLAS_API_KEY')
NYLAS_API_URI = os.environ.get('NYLAS_API_URI')
AIBE_BRAIN_URL = os.environ.get('AIBE_BRAIN_URL', 'http://localhost')
AGENT_GLOBAL = 'EANEW'

# Topic for canned response generation (placeholder)
TOPIC = "automated deliberation response"

def get_nylas_inbox():
    """Fetch unread emails from Nylas inbox."""
    # Placeholder: Implement Nylas API call to fetch messages
    # For retry, simulate returning a list of message dicts
    return []

def generate_deliberation(subject, from_email, body):
    """Generate a deliberation text based on email content.
    
    Returns a dict with 'deliberation_text' and optionally 'action': 'SEND_EMAIL'.
    """
    # Placeholder: Replace with actual AI deliberation logic
    # By default, do not send email unless explicitly instructed
    return {
        'deliberation_text': f'Processed inbound from {from_email}: {subject}',
        'action': None  # No email to send
    }

def check_echo_filter(from_email):
    """Check if this sender has been processed by EANEW in the last hour."""
    one_hour_ago = (datetime.utcnow() - timedelta(hours=1)).isoformat() + 'Z'
    query_url = f"{AIBE_BRAIN_URL}/rest/v1/aibe_brain?agent_global=eq.{AGENT_GLOBAL}&content=like.*{from_email}*&created_at=gte.{one_hour_ago}"
    headers = {'Content-Type': 'application/json'}
    try:
        resp = requests.get(query_url, headers=headers, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list) and len(data) > 0:
                return True
            # Possibly the API returns a dict with count
            if isinstance(data, dict) and data.get('count', 0) > 0:
                return True
    except Exception as e:
        logger.error(f"Echo filter query failed: {e}")
    return False

def write_acl_stamp(from_email, subject, deliberation_text, stamp_type='LOGIFUL', echodropped=False):
    """Write a brain bead with 4-colon ACL stamp to AIBE_BRAIN."""
    acl_stamp = 'ane:w:c3:001'
    payload = {
        'stamp_type': stamp_type,
        'agent_global': AGENT_GLOBAL,
        'summary': f'[EANEW] processed inbound: {subject}',
        'content': deliberation_text,
        'acl_stamp': acl_stamp
    }
    if echodropped:
        payload['stamp_type'] = 'ECHO_DROPPED'
    url = f"{AIBE_BRAIN_URL}/rest/v1/aibe_brain"
    headers = {'Content-Type': 'application/json'}
    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=10)
        if resp.status_code in (200, 201):
            logger.info(f"Brain write successful: {subject}")
        else:
            logger.error(f"Brain write failed: {resp.status_code} {resp.text}")
    except Exception as e:
        logger.error(f"Brain write exception: {e}")

def process_single_email(message):
    """Process one inbound email message."""
    subject = message.get('subject', 'No Subject')
    from_email = message.get('from', [{}])[0].get('email', 'unknown') if isinstance(message.get('from'), list) else message.get('from', 'unknown')
    body = message.get('body', '')
    logger.info(f"Processing email from {from_email}: {subject}")
    
    # FIX B: Echo filter - check recent EANEW beads
    if check_echo_filter(from_email):
        logger.info(f"Echo detected for {from_email}, marking ECHO_DROPPED and returning.")
        write_acl_stamp(from_email, subject, f"Echo dropped from {from_email}", stamp_type='ECHO_DROPPED', echodropped=True)
        return
    
    # Generate deliberation
    result = generate_deliberation(subject, from_email, body)
    deliberation_text = result.get('deliberation_text', '')
    action = result.get('action')
    
    # FIX A: Write to brain instead of sending email by default
    write_acl_stamp(from_email, subject, deliberation_text, stamp_type='LOGIFUL')
    
    # Only send email if deliberation explicitly requests it
    if action == 'SEND_EMAIL':
        # Placeholder: send email via Nylas
        logger.info(f"Deliberation requested email send for {subject}")
        # send_email_logic(message, deliberation_text)  # Not implemented
    else:
        logger.info(f"No email sent for {subject}; deliberation did not request SEND_EMAIL")

def main_loop():
    """Main cycle loop."""
    logger.info("Starting EANEW cycle loop")
    while True:
        try:
            inbox = get_nylas_inbox()
            for msg in inbox:
                process_single_email(msg)
            # Sleep to avoid tight loop
            time.sleep(5)
        except Exception as e:
            logger.error(f"Cycle error: {e}")
            time.sleep(10)

if __name__ == '__main__':
    main_loop()