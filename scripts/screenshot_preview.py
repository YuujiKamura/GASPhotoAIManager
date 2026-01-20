"""Take screenshots of the photo album preview for visual verification."""
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont
import os
import sys
import json
import base64

SCREENSHOT_DIR = os.path.join(os.path.dirname(__file__), '..', 'test-screenshots')
TEST_IMAGES_DIR = os.path.join(os.path.dirname(__file__), '..', 'test-images')
TEST_DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'test-data')
os.makedirs(SCREENSHOT_DIR, exist_ok=True)
os.makedirs(TEST_IMAGES_DIR, exist_ok=True)
os.makedirs(TEST_DATA_DIR, exist_ok=True)

def create_test_images():
    """Create test construction site photos and return paths + base64."""
    images = []
    for i in range(4):
        img = Image.new('RGB', (800, 600), color=(200, 200, 200))
        draw = ImageDraw.Draw(img)
        draw.rectangle([50, 50, 750, 550], outline=(100, 100, 100), width=3)
        draw.rectangle([100, 400, 350, 550], fill=(40, 40, 40))

        try:
            font = ImageFont.truetype("arial.ttf", 40)
            small_font = ImageFont.truetype("arial.ttf", 20)
        except:
            font = ImageFont.load_default()
            small_font = font

        status = "着手前" if i % 2 == 0 else "完了"
        draw.text((300, 200), f"Test Photo {i+1}", fill=(50, 50, 50), font=font)
        draw.text((110, 420), f"Construction Site", fill=(255, 255, 255), font=small_font)
        draw.text((110, 450), f"2025-01-20", fill=(255, 255, 255), font=small_font)
        draw.text((110, 480), f"Status: {status}", fill=(255, 255, 255), font=small_font)

        filepath = os.path.join(TEST_IMAGES_DIR, f'test_photo_{i+1}.jpg')
        img.save(filepath, 'JPEG', quality=90)

        # Read as base64
        with open(filepath, 'rb') as f:
            b64 = base64.b64encode(f.read()).decode('utf-8')

        images.append({
            'path': filepath,
            'base64': f'data:image/jpeg;base64,{b64}'
        })
        print(f"Created: {filepath}")

    return images

def create_test_json(images):
    """Create a JSON file with test photo records."""
    records = []
    for i, img in enumerate(images):
        status = "着手前" if i % 2 == 0 else "完了"
        records.append({
            "fileName": f"test_photo_{i+1}.jpg",
            "base64": img['base64'],
            "date": f"2025-01-20T{10+i}:00:00.000Z",
            "analysis": {
                "workType": "舗装工",
                "variety": "アスファルト舗装",
                "detail": "表層工",
                "remarks": f"撮影区間 No.{i+1}+00～No.{i+2}+00",
                "measurements": "幅員 W=4.0m",
                "station": status
            }
        })

    json_path = os.path.join(TEST_DATA_DIR, 'test_records.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    print(f"Created JSON: {json_path}")
    return json_path

def take_screenshots():
    # Create test images and JSON
    images = create_test_images()
    json_path = create_test_json(images)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1400, 'height': 1200})

        print("\n1. Navigating to app...")
        page.goto('http://localhost:5173')
        page.wait_for_load_state('networkidle')

        # Load JSON file directly
        print("2. Loading JSON file...")
        json_input = page.locator('input[type="file"][accept=".json"]')
        if json_input.count() > 0:
            json_input.set_input_files(json_path)
            page.wait_for_timeout(2000)
        else:
            print("   No JSON input found!")

        page.screenshot(path=os.path.join(SCREENSHOT_DIR, '02_after_json_load.png'), full_page=True)
        print("   Saved: 02_after_json_load.png")

        # Check for photos
        print("\n   Page content check:")
        has_photos = page.locator('img[src^="data:"]').count()
        print(f"   - Photos with base64 data: {has_photos}")

        # Look for 台帳 tab
        print("\n3. Looking for 台帳 tab...")
        album_tab = page.locator('button:has-text("台帳"), span:has-text("台帳"), text=台帳').first
        try:
            if album_tab.is_visible():
                print("   Found 台帳, clicking...")
                album_tab.click()
                page.wait_for_timeout(1000)
        except:
            print("   Could not click 台帳 tab")

        page.screenshot(path=os.path.join(SCREENSHOT_DIR, '03_album_view.png'), full_page=True)
        print("   Saved: 03_album_view.png")

        # Debug: print all visible text elements that might be tabs
        print("\n   Looking for navigation elements:")
        navs = page.locator('button, [role="tab"], a').all()
        for nav in navs[:15]:
            try:
                text = nav.text_content() or ""
                if text.strip():
                    print(f"     - '{text.strip()[:30]}'")
            except:
                pass

        # Look for template selector (2枚/3枚 buttons)
        print("\n4. Looking for template selector...")
        template_buttons = page.locator('button:has-text("枚")').all()
        print(f"   Found {len(template_buttons)} template buttons")

        if len(template_buttons) >= 2:
            page.screenshot(path=os.path.join(SCREENSHOT_DIR, '04_template_3up.png'), full_page=True)
            print("   Saved: 04_template_3up.png")

            # Click 2枚 button
            for btn in template_buttons:
                text = btn.text_content() or ""
                if "2" in text:
                    print(f"   Switching to 2-up: {text}")
                    btn.click()
                    page.wait_for_timeout(500)
                    break

            page.screenshot(path=os.path.join(SCREENSHOT_DIR, '05_template_2up.png'), full_page=True)
            print("   Saved: 05_template_2up.png")

        browser.close()
        print(f"\nDone! Screenshots saved to: {SCREENSHOT_DIR}")
        return SCREENSHOT_DIR

if __name__ == '__main__':
    take_screenshots()
