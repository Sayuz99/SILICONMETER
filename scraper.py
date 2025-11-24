import json
import datetime
import random
import os
import requests
from bs4 import BeautifulSoup
import time

# --- CONFIGURATION ---
DATA_FILE = "data.json"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"

# --- THE "PANIC" ALGORITHM ---
def calculate_sentiment(current_price, history):
    """
    Determines if we should PANIC, BUY, or HOLD based on the 7-day moving average.
    """
    if not history:
        return "hold"
    
    # Get last 7 entries (or fewer if not enough data)
    recent_history = history[-7:]
    
    # Calculate Moving Average
    avg_price = sum(item['price'] for item in recent_history) / len(recent_history)
    
    # Logic
    if current_price > avg_price * 1.10:
        return "panic"  # Price is >10% above average
    elif current_price < avg_price * 0.95:
        return "buy"    # Price is <5% below average
    else:
        return "hold"

# --- SCRAPING LOGIC ---
def get_real_price(url, selector):
    """
    REAL SCRAPING MODE:
    Fetches HTML and extracts price. 
    Note: Major retailers block simple scrapers. You often need headers or proxies.
    """
    try:
        headers = {"User-Agent": USER_AGENT}
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, 'html.parser')
            price_text = soup.select_one(selector).text
            # Clean string (remove '$', commas)
            price = float(price_text.replace('$', '').replace(',', '').strip())
            return price
    except Exception as e:
        print(f"Error scraping {url}: {e}")
        return None

def get_simulated_price(last_price):
    """
    DEMO MODE:
    Simulates a volatile market where DRAM prices are generally trending up.
    """
    volatility = random.uniform(-0.05, 0.10) # Trend slightly positive (-5% to +10%)
    new_price = last_price * (1 + volatility)
    return round(new_price, 2)

# --- DATABASE MANAGEMENT ---
def load_data():
    if not os.path.exists(DATA_FILE):
        print("No data file found. Creating new one...")
        return {"last_updated": None, "products": []}
    with open(DATA_FILE, 'r') as f:
        return json.load(f)

def save_data(data):
    data['last_updated'] = datetime.datetime.now().isoformat()
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)
    print(f"Database saved to {DATA_FILE}")

# --- MAIN RUNNER ---
def main():
    print("--- Starting SiliconMeter Scraper ---")
    db = load_data()
    
    # Current timestamp
    today = datetime.datetime.now().strftime("%Y-%m-%d")
    
    for product in db['products']:
        print(f"Processing: {product['name']}...")
        
        # 1. GET PRICE
        # TOGGLE THIS: Use get_real_price() for production, get_simulated_price() for testing
        # current_price = get_real_price(product['url'], product['selector'])
        
        # For this demo, we use the simulation based on the last recorded price
        last_recorded_price = product['history'][-1]['price'] if product['history'] else 100
        current_price = get_simulated_price(last_recorded_price)
        
        if current_price:
            # 2. CALCULATE SENTIMENT
            sentiment = calculate_sentiment(current_price, product['history'])
            
            # 3. UPDATE PRODUCT
            product['current_price'] = current_price
            product['change_24h'] = round(((current_price - last_recorded_price) / last_recorded_price) * 100, 2)
            product['sentiment'] = sentiment
            
            # 4. APPEND HISTORY (Idempotent: don't add duplicate entry for same day)
            if not product['history'] or product['history'][-1]['date'] != today:
                product['history'].append({
                    "date": today,
                    "price": current_price
                })
                # Keep history manageable (e.g., last 365 days)
                if len(product['history']) > 365:
                    product['history'].pop(0)
            else:
                # Update today's existing entry
                product['history'][-1]['price'] = current_price

            print(f"  -> Price: ${current_price} | Sentiment: {sentiment.upper()}")
        else:
            print("  -> Failed to fetch price.")

    save_data(db)
    print("--- Scrape Complete ---")

if __name__ == "__main__":
    main()