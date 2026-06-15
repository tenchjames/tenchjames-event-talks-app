import os
import time
import feedparser
from bs4 import BeautifulSoup
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# Cache configuration
CACHE_EXPIRY_SECONDS = 300  # 5 minutes
cache = {
    "data": None,
    "last_fetched": 0
}

FEED_URL = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"

def parse_feed_data():
    # Parse the RSS/Atom feed from Google
    feed = feedparser.parse(FEED_URL)
    
    # Check if feedparser encountered parsing errors or network failures
    if feed.get('bozo', 0) == 1 and not feed.entries:
        raise Exception("Failed to retrieve or parse XML feed. Please check network connection.")
        
    parsed_entries = []
    
    for entry in feed.entries:
        date = entry.get("title", "")
        updated = entry.get("updated", "")
        link = entry.get("link", "")
        entry_id = entry.get("id", "")
        
        summary_html = entry.get("summary", "")
        soup = BeautifulSoup(summary_html, "html.parser")
        
        updates = []
        current_type = None
        current_content = []
        
        # Each entry summary has multiple <h3>...</h3> headers and following HTML tags.
        # We group sibling tags that fall between <h3> headers.
        for child in soup.children:
            if child.name == 'h3':
                if current_type is not None:
                    # Save the previous update chunk
                    updates.append({
                        "type": current_type,
                        "content_html": "".join(str(c) for c in current_content),
                        "content_text": " ".join(c.get_text() for c in current_content if hasattr(c, "get_text")).strip()
                    })
                current_type = child.get_text().strip()
                current_content = []
            elif child.name is not None:
                current_content.append(child)
                
        # Append the final update in the summary
        if current_type is not None:
            updates.append({
                "type": current_type,
                "content_html": "".join(str(c) for c in current_content),
                "content_text": " ".join(c.get_text() for c in current_content if hasattr(c, "get_text")).strip()
            })
            
        # Fallback: if the HTML summary didn't follow the <h3> pattern, we capture the entire summary
        if not updates and summary_html:
            updates.append({
                "type": "General",
                "content_html": summary_html,
                "content_text": soup.get_text().strip()
            })
            
        parsed_entries.append({
            "date": date,
            "updated": updated,
            "link": link,
            "id": entry_id,
            "updates": updates
        })
        
    return {
        "title": feed.feed.get("title", "BigQuery Release Notes"),
        "entries": parsed_entries,
        "fetched_at": time.time()
    }

def get_release_notes(force_refresh=False):
    now = time.time()
    if force_refresh or cache["data"] is None or (now - cache["last_fetched"]) > CACHE_EXPIRY_SECONDS:
        try:
            cache["data"] = parse_feed_data()
            cache["last_fetched"] = now
            cache["status"] = "success"
        except Exception as e:
            # If fetch fails but we have cached data, return the stale cache with a warning
            if cache["data"] is not None:
                return {
                    "data": cache["data"],
                    "status": "warning",
                    "message": f"Could not refresh: {str(e)}. Showing last cached version."
                }
            else:
                return {
                    "data": None,
                    "status": "error",
                    "message": f"Failed to retrieve release notes: {str(e)}"
                }
    
    return {
        "data": cache["data"],
        "status": "success",
        "message": "Loaded from cache"
    }

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/notes')
def get_notes():
    force_refresh = request.args.get('refresh', 'false').lower() == 'true'
    result = get_release_notes(force_refresh=force_refresh)
    return jsonify(result)

if __name__ == '__main__':
    # We will bind to port 5001 to avoid system port collisions
    app.run(debug=True, host='0.0.0.0', port=5001)
