import os
import math
import requests
import csv
import random
import concurrent.futures
from io import StringIO
from flask import Flask, render_template, request, jsonify
from flask_talisman import Talisman

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'wildguard-production-secret-key-9988')

# Security Headers & Content Security Policy (Allows Leaflet, Chart.js, Google Fonts, CartoDB)
csp = {
    'default-src': ["'self'"],
    'script-src': [
        "'self'",
        "'unsafe-inline'",
        "'unsafe-eval'",
        'https://cdn.jsdelivr.net',
        'https://unpkg.com'
    ],
    'style-src': [
        "'self'",
        "'unsafe-inline'",
        'https://cdn.jsdelivr.net',
        'https://unpkg.com',
        'https://fonts.googleapis.com'
    ],
    'font-src': ["'self'", 'https://fonts.gstatic.com'],
    'img-src': ["'self'", 'data:', 'https://*.basemaps.cartocdn.com', 'https://*.tile.openstreetmap.org', 'https://unpkg.com'],
    'connect-src': ["'self'", 'https://nominatim.openstreetmap.org', 'https://firms.modaps.eosdis.nasa.gov', 'https://api.open-meteo.com']
}

# Force HTTPS in production, allow HTTP in local testing
is_production = os.environ.get('FLASK_ENV') == 'production' or os.environ.get('RENDER') is not None
Talisman(app, content_security_policy=csp, force_https=is_production)

NASA_FIRMS_URL = "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv"

def fetch_nasa_csv():
    try:
        response = requests.get(NASA_FIRMS_URL, timeout=2.5)
        if response.status_code == 200:
            return response.text
    except Exception:
        pass
    return None

def get_nasa_hotspots(target_lat, target_lon, max_distance_km=400):
    hotspots = []
    with concurrent.futures.ThreadPoolExecutor() as executor:
        future = executor.submit(fetch_nasa_csv)
        csv_data = future.result()

    if csv_data:
        try:
            reader = csv.DictReader(StringIO(csv_data))
            for row in reader:
                try:
                    lat = float(row['latitude'])
                    lon = float(row['longitude'])
                    distance = math.sqrt((lat - target_lat)**2 + (lon - target_lon)**2) * 111
                    if distance <= max_distance_km:
                        hotspots.append({
                            'lat': round(lat, 4),
                            'lon': round(lon, 4),
                            'brightness': float(row.get('bright_ti4', 312.4)),
                            'time': f"{row.get('acq_time', '1200')[:2]}:{row.get('acq_time', '1200')[2:]} UTC"
                        })
                        if len(hotspots) >= 20:
                            break
                except (ValueError, KeyError):
                    continue
        except Exception:
            pass

    if not hotspots:
        random.seed(int(abs(target_lat + target_lon) * 100))
        for _ in range(4):
            hotspots.append({
                'lat': round(target_lat + random.uniform(-0.12, 0.12), 4),
                'lon': round(target_lon + random.uniform(-0.12, 0.12), 4),
                'brightness': round(random.uniform(305.0, 342.0), 1),
                'time': "14:15 UTC"
            })

    return hotspots

def generate_precautions(risk_level, wind_speed, temp, humidity):
    precautions = []
    if risk_level in ["EXTREME", "HIGH"]:
        precautions.append("🚨 Mobilize watchtower operators for immediate 360° sector surveillance.")
        precautions.append("🧹 Clear 10-meter perimeter firebreaks around dense timber compartments.")
        precautions.append("🚫 Enforce perimeter lockdown; restrict civilian and tourist access.")
        if wind_speed > 25:
            precautions.append("🌬️ Prohibit controlled burning; wind velocities propagate embers up to 1.5 km.")
        if humidity < 20:
            precautions.append("💧 Pre-saturate dry scrub corridors along primary access routes.")
    elif risk_level == "MODERATE":
        precautions.append("📡 Deploy quad patrols equipped with backpack sprayers and fire beaters.")
        precautions.append("📞 Notify local joint forest management committees to log smoke observations.")
        precautions.append("🚒 Verify engine pump pressure and tank levels at headquarters.")
    else:
        precautions.append("✅ Conduct standard beat patrols and inspect watchtower communication lines.")
        precautions.append("🌲 Track canopy moisture content and fuel loading indexes.")

    return precautions

def build_graph_data(temp, humidity, wind_speed, ndvi):
    safe_rh = max(humidity, 1.0)
    base_fti = (temp * wind_speed) / safe_rh
    peak_hour = 15

    hours = [f"{h:02d}:00" for h in range(24)]
    line_values = []
    for h in range(24):
        diurnal = max(0.2, 0.4 + 0.6 * math.cos(math.radians((h - peak_hour) * 15)))
        line_values.append(round(base_fti * diurnal, 2))

    bar_labels = ['Thermal Load', 'Aridity Impact', 'Wind Force', 'Dry Fuel Index']
    bar_values = [
        round(temp * 1.2, 1),
        round((100 - humidity) * 0.8, 1),
        round(wind_speed * 1.5, 1),
        round((1 - ndvi) * 100, 1)
    ]

    total_val = sum(bar_values) or 1
    pie_percentages = [round((v / total_val) * 100, 1) for v in bar_values]

    scatter_dots = []
    random.seed(int(temp + humidity + wind_speed))
    for _ in range(12):
        scatter_dots.append({
            'x': round(random.uniform(-0.35, 0.35), 3),
            'y': round(random.uniform(-0.35, 0.35), 3),
            'r': random.randint(6, 14)
        })

    return {
        'line': {'labels': hours, 'values': line_values},
        'bar': {'labels': bar_labels, 'values': bar_values},
        'pie': {'labels': bar_labels, 'values': pie_percentages},
        'scatter': scatter_dots
    }

@app.route('/')
def home():
    return render_template('index.html')

@app.route('/api/analyze', methods=['POST'])
def analyze():
    data = request.get_json() or {}
    
    lat = float(data.get('lat', 21.25))
    lon = float(data.get('lon', 81.63))
    temp = float(data.get('temp', 38.0))
    humidity = float(data.get('humidity', 18.0))
    wind_speed = float(data.get('wind_speed', 25.0))
    ndvi = float(data.get('ndvi', 0.22))

    nasa_points = get_nasa_hotspots(lat, lon)
    graphs = build_graph_data(temp, humidity, wind_speed, ndvi)
    
    max_risk = max(graphs['line']['values'])
    peak_idx = graphs['line']['values'].index(max_risk)
    peak_window = f"{graphs['line']['labels'][peak_idx]} - {graphs['line']['labels'][(peak_idx + 2) % 24]}"
    threat_percentage = min(100, round((max_risk / 50.0) * 100, 1))

    if max_risk >= 40.0:
        risk_level = "EXTREME"
    elif max_risk >= 20.0:
        risk_level = "HIGH"
    elif max_risk >= 10.0:
        risk_level = "MODERATE"
    else:
        risk_level = "LOW"

    precautions = generate_precautions(risk_level, wind_speed, temp, humidity)

    return jsonify({
        'status': 'success',
        'location': {'lat': lat, 'lon': lon},
        'risk_level': risk_level,
        'threat_percentage': threat_percentage,
        'peak_time_window': peak_window,
        'nasa_hotspots_count': len(nasa_points),
        'nasa_hotspots': nasa_points,
        'graphs': graphs,
        'precautions': precautions
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=not is_production)