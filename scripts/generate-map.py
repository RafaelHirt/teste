"""Gera a malha SVG simplificada, sem dependências externas.
python3 scripts/generate-map.py /caminho/geojs-52-mun.json
Fonte: https://github.com/tbrugz/geodata-br (IBGE, CC0).
"""
import json
import math
import sys
from pathlib import Path


def simplify(points, tolerance=0.35):
    if len(points) <= 2:
        return points
    ax, ay = points[0]
    bx, by = points[-1]
    denominator = (bx - ax) ** 2 + (by - ay) ** 2
    maximum, split = 0, 0
    for index, (x, y) in enumerate(points[1:-1], 1):
        ratio = max(0, min(1, ((x-ax)*(bx-ax)+(y-ay)*(by-ay))/denominator)) if denominator else 0
        distance = math.hypot(x-ax-ratio*(bx-ax), y-ay-ratio*(by-ay))
        if distance > maximum:
            maximum, split = distance, index
    return simplify(points[:split+1], tolerance)[:-1] + simplify(points[split:], tolerance) if maximum > tolerance else [points[0], points[-1]]


def centroid(ring):
    area, sx, sy = 0, 0, 0
    for (ax, ay), (bx, by) in zip(ring, ring[1:]):
        cross = ax*by-bx*ay
        area += cross
        sx += (ax+bx)*cross
        sy += (ay+by)*cross
    if abs(area) < 0.001:
        return ring[0]
    return sx/(3*area), sy/(3*area)


source = json.loads(Path(sys.argv[1]).read_text())
assert len(source['features']) == 246
rings = []
for feature in source['features']:
    polygons = feature['geometry']['coordinates']
    if feature['geometry']['type'] == 'Polygon':
        polygons = [polygons]
    rings += [ring for polygon in polygons for ring in polygon]
cosine = math.cos(math.radians(16))
all_points = [(x*cosine, -y) for ring in rings for x, y, *_ in ring]
min_x, min_y = map(min, zip(*all_points))
max_x, max_y = map(max, zip(*all_points))
scale = min(550/(max_x-min_x), 485/(max_y-min_y))
offset_x = (640-(max_x-min_x)*scale)/2
offset_y = (540-(max_y-min_y)*scale)/2


def project(point):
    return ((point[0]*cosine-min_x)*scale+offset_x, (-point[1]-min_y)*scale+offset_y)


municipalities = []
for feature in source['features']:
    polygons = feature['geometry']['coordinates']
    if feature['geometry']['type'] == 'Polygon':
        polygons = [polygons]
    path = []
    outer = max((polygon[0] for polygon in polygons), key=len)
    x, y = centroid([project(point) for point in outer])
    for polygon in polygons:
        for ring in polygon:
            points = simplify([project(point) for point in ring])
            if len(points) < 4:
                points = [project(point) for point in ring]
            path.append('M'+'L'.join(f'{x:.1f},{y:.1f}' for x, y in points)+'Z')
    municipalities.append({'id': feature['properties']['id'], 'name': feature['properties']['name'], 'path': ''.join(path), 'x': round(x, 1), 'y': round(y, 1)})
destination = Path('src/data/goias.json')
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps({'source': 'IBGE via tbrugz/geodata-br; CC0 1.0; malha simplificada para visualização', 'municipalities': municipalities}, ensure_ascii=False, separators=(',', ':')))
print(f'{len(municipalities)} municípios; {destination.stat().st_size} bytes')
