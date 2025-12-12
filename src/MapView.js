import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polygon, useMap, Rectangle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import config from './config';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

class CampusManager {
  constructor(campusCenterLocation) {
    this.campusCenterLocation = campusCenterLocation;
    this.campusBounds = this.generateCampusBounds();
    this.sections = this.generateCampusSections();
  }

  generateCampusBounds() {
    if (!this.campusCenterLocation) {
      return [[6.9270, 79.8610], [6.9272, 79.8612]];
    }
    
    const { latitude, longitude } = this.campusCenterLocation;
    const { CAMPUS_WIDTH, CAMPUS_HEIGHT } = config.CAMPUS_SETTINGS;
    
    const southWest = [
      latitude - (CAMPUS_HEIGHT / 2),
      longitude - (CAMPUS_WIDTH / 2)
    ];
    
    const northEast = [
      latitude + (CAMPUS_HEIGHT / 2),
      longitude + (CAMPUS_WIDTH / 2)
    ];
    
    return [southWest, northEast];
  }

  generateCampusSections() {
    if (!this.campusBounds) return [];
    
    const [southWest, northEast] = this.campusBounds;
    const centerLat = (southWest[0] + northEast[0]) / 2;
    const centerLng = (southWest[1] + northEast[1]) / 2;
    
    const baseSize = 0.0000225;
    
    const sections = [
      {
        id: 'library',
        name: 'Library Section',
        type: 'library',
        color: '#3B82F6',
        coordinates: this.generateRectangle(centerLat, centerLng, baseSize * 1.2, -baseSize * 1.2, baseSize * 2, baseSize * 1.8),
        description: 'Library and study area with books and computers',
        width: '5m',
        height: '4.5m'
      },
      {
        id: 'lab',
        name: 'Laboratory Section',
        type: 'lab',
        color: '#10B981',
        coordinates: this.generateRectangle(centerLat, centerLng, baseSize * 1.2, baseSize * 1.2, baseSize * 2.5, baseSize * 2),
        description: 'Science and computer laboratories with research equipment',
        width: '6m',
        height: '5m'
      },
      {
        id: 'classroom',
        name: 'Classroom Section',
        type: 'classroom',
        color: '#F59E0B',
        coordinates: this.generateRectangle(centerLat, centerLng, -baseSize * 1.2, -baseSize * 1.2, baseSize * 1.8, baseSize * 1.6),
        description: 'Lecture halls and classrooms for teaching',
        width: '4.5m',
        height: '4m'
      },
      {
        id: 'admin',
        name: 'Administration Section',
        type: 'admin',
        color: '#EF4444',
        coordinates: this.generateRectangle(centerLat, centerLng, -baseSize * 1.2, baseSize * 1.2, baseSize * 2, baseSize * 1.8),
        description: 'Administrative offices and student services',
        width: '5m',
        height: '4.5m'
      }
    ];

    this.verifyNoOverlaps(sections);
    
    return sections;
  }

  generateRectangle(centerLat, centerLng, offsetLat, offsetLng, width, height) {
    const lat = centerLat + offsetLat;
    const lng = centerLng + offsetLng;
    
    return [
      [lat - height/2, lng - width/2],
      [lat - height/2, lng + width/2],
      [lat + height/2, lng + width/2],
      [lat + height/2, lng - width/2],
      [lat - height/2, lng - width/2]
    ];
  }

  verifyNoOverlaps(sections) {
    let hasOverlaps = false;
    
    for (let i = 0; i < sections.length; i++) {
      for (let j = i + 1; j < sections.length; j++) {
        const sectionA = sections[i];
        const sectionB = sections[j];
        
        if (this.doPolygonsOverlap(sectionA.coordinates, sectionB.coordinates)) {
          hasOverlaps = true;
        }
      }
    }
    
    return !hasOverlaps;
  }

  doPolygonsOverlap(polyA, polyB) {
    const boundsA = this.getPolygonBounds(polyA);
    const boundsB = this.getPolygonBounds(polyB);
    
    if (boundsA.north < boundsB.south || boundsA.south > boundsB.north ||
        boundsA.east < boundsB.west || boundsA.west > boundsB.east) {
      return false;
    }
    
    for (const vertex of polyA) {
      if (this.isPointInPolygon(vertex[0], vertex[1], polyB)) {
        return true;
      }
    }
    
    for (const vertex of polyB) {
      if (this.isPointInPolygon(vertex[0], vertex[1], polyA)) {
        return true;
      }
    }
    
    return false;
  }

  getPolygonBounds(polygon) {
    let north = -90, south = 90, east = -180, west = 180;
    
    for (const vertex of polygon) {
      const lat = vertex[0];
      const lng = vertex[1];
      
      north = Math.max(north, lat);
      south = Math.min(south, lat);
      east = Math.max(east, lng);
      west = Math.min(west, lng);
    }
    
    return { north, south, east, west };
  }

  getZoneDescription(type) {
    const descriptions = {
      library: "Library and study area with books and computers",
      lab: "Science and computer laboratories with research equipment",
      classroom: "Lecture halls and classrooms for teaching",
      admin: "Administrative offices and student services"
    };
    return descriptions[type] || "Campus section";
  }

  isInCampus(lat, lng) {
    if (!this.campusBounds) return false;
    
    const [southWest, northEast] = this.campusBounds;
    return (
      lat >= southWest[0] && 
      lat <= northEast[0] && 
      lng >= southWest[1] && 
      lng <= northEast[1]
    );
  }

  getCurrentSection(lat, lng) {
    for (const section of this.sections) {
      if (this.isPointInPolygon(lat, lng, section.coordinates)) {
        return section;
      }
    }
    return null;
  }

  isPointInPolygon(lat, lng, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][1], yi = polygon[i][0];
      const xj = polygon[j][1], yj = polygon[j][0];
      
      const intersect = ((yi > lng) !== (yj > lng)) &&
          (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}

const createAdvancedDirectionalIcon = (color, heading, speed, isMobile, isCurrentDevice, gpsQuality, simulatedMovement, isFirstDevice = false) => {
  if (isMobile) {
    const pulseAnimation = isCurrentDevice ? `
      @keyframes pulse {
        0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        50% { transform: translate(-50%, -50%) scale(1.2); opacity: 0.7; }
        100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      }
    ` : '';

    const qualityIndicator = gpsQuality ? `
      <div style="
        position: absolute;
        top: -5px;
        right: -5px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: ${getQualityColor(gpsQuality)};
        border: 2px solid white;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      "></div>
    ` : '';

    const firstDeviceIndicator = isFirstDevice ? `
      <div style="
        position: absolute;
        bottom: -15px;
        left: 50%;
        transform: translateX(-50%);
        background: #6366F1;
        color: white;
        padding: 2px 6px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: bold;
        white-space: nowrap;
        border: 2px solid white;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      ">🏫 CAMPUS</div>
    ` : '';

    return L.divIcon({
      className: 'custom-direction-icon',
      html: `
        <style>${pulseAnimation}</style>
        <div style="
          position: relative;
          width: 32px;
          height: 32px;
        ">
          ${isCurrentDevice ? `
            <div style="
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              width: 36px;
              height: 36px;
              border: 2px solid #2563eb;
              border-radius: 50%;
              animation: pulse 2s infinite;
            "></div>
          ` : ''}
          
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%) rotate(${heading || 0}deg);
            width: 0;
            height: 0;
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-bottom: 12px solid ${color};
            filter: drop-shadow(0 2px 2px rgba(0,0,0,0.2));
          "></div>
          
          <div style="
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 8px;
            height: 8px;
            background: ${color};
            border: 2px solid white;
            border-radius: 50%;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          "></div>
          
          ${qualityIndicator}
          ${firstDeviceIndicator}
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }

  // Desktop device icon with movement indicator
  const firstDeviceIndicator = isFirstDevice ? `
    <div style="
      position: absolute;
      bottom: -15px;
      left: 50%;
      transform: translateX(-50%);
      background: #6366F1;
      color: white;
      padding: 2px 6px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: bold;
      white-space: nowrap;
      border: 2px solid white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    ">🏫 CAMPUS</div>
  ` : '';

  const simulationIndicator = simulatedMovement ? `
    <div style="
      position: absolute;
      top: -5px;
      right: -5px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #10B981;
      border: 2px solid white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      animation: blink 1s infinite;
    "></div>
    <style>
      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    </style>
  ` : '';

  return L.divIcon({
    className: 'computer-device-icon',
    html: `
      <div style="
        position: relative;
        width: 28px;
        height: 28px;
      ">
        <div style="
          width: 22px;
          height: 22px;
          background: ${color};
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        "></div>
        ${simulationIndicator}
        ${firstDeviceIndicator}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

const getQualityColor = (quality) => {
  switch(quality) {
    case 'excellent': return '#10B981';
    case 'good': return '#3B82F6';
    case 'moderate': return '#F59E0B';
    case 'poor': return '#EF4444';
    default: return '#6B7280';
  }
};

function MapController({ onUserInteraction }) {
  const map = useMap();
  const userInteracting = useRef(false);
  const interactionTimer = useRef(null);

  useEffect(() => {
    const handleInteractionStart = () => {
      userInteracting.current = true;
      onUserInteraction(true);
      
      if (interactionTimer.current) {
        clearTimeout(interactionTimer.current);
      }
    };

    const handleInteractionEnd = () => {
      interactionTimer.current = setTimeout(() => {
        userInteracting.current = false;
        onUserInteraction(false);
      }, 2000);
    };

    map.on('movestart', handleInteractionStart);
    map.on('dragstart', handleInteractionStart);
    map.on('zoomstart', handleInteractionStart);
    map.on('mousedown', handleInteractionStart);
    
    map.on('moveend', handleInteractionEnd);
    map.on('dragend', handleInteractionEnd);
    map.on('zoomend', handleInteractionEnd);
    map.on('mouseup', handleInteractionEnd);

    return () => {
      map.off('movestart', handleInteractionStart);
      map.off('dragstart', handleInteractionStart);
      map.off('zoomstart', handleInteractionStart);
      map.off('mousedown', handleInteractionStart);
      
      map.off('moveend', handleInteractionEnd);
      map.off('dragend', handleInteractionEnd);
      map.off('zoomend', handleInteractionEnd);
      map.off('mouseup', handleInteractionEnd);
      
      if (interactionTimer.current) {
        clearTimeout(interactionTimer.current);
      }
    };
  }, [map, onUserInteraction]);

  return null;
}

function InitialAutoCenter({ devices, campusBounds, onMapReady }) {
  const map = useMap();
  const hasCentered = useRef(false);

  useEffect(() => {
    if (!hasCentered.current && (devices.length > 0 || campusBounds)) {
      let center, zoom;
      
      if (devices.length > 0) {
        const validDevices = devices.filter(device => 
          device.last_location && 
          device.last_location.latitude && 
          device.last_location.longitude
        );

        if (validDevices.length > 0) {
          center = calculateMapCenter(validDevices);
          zoom = calculateZoom(validDevices);
        }
      }
      
      if (!center && campusBounds) {
        const [southWest, northEast] = campusBounds;
        center = [
          (southWest[0] + northEast[0]) / 2,
          (southWest[1] + northEast[1]) / 2
        ];
        zoom = 19;
      }

      if (!center) {
        center = [6.9271, 79.8612];
        zoom = 19;
      }

      if (center) {
        map.setView(center, zoom, {
          animate: true,
          duration: 1
        });
        hasCentered.current = true;
        
        if (onMapReady) {
          onMapReady();
        }
      }
    }
  }, [devices, campusBounds, map, onMapReady]);

  return null;
}

function StableMapUpdater({ devices, userInteracting, campusBounds }) {
  const map = useMap();
  const lastDeviceCount = useRef(0);
  const lastDevicePositions = useRef([]);
  const updateInProgress = useRef(false);

  useEffect(() => {
    if (userInteracting || updateInProgress.current) return;

    const validDevices = devices.filter(device => 
      device.last_location && 
      device.last_location.latitude && 
      device.last_location.longitude
    );

    const shouldUpdate = shouldUpdateMap(validDevices, lastDevicePositions.current, lastDeviceCount.current);

    if (shouldUpdate && validDevices.length > 0) {
      updateInProgress.current = true;
      
      const center = calculateMapCenter(validDevices);
      const zoom = calculateZoom(validDevices);
      
      const currentZoom = map.getZoom();
      const currentCenter = map.getCenter();
      
      const zoomChanged = Math.abs(currentZoom - zoom) > 0.5;
      const centerChanged = currentCenter.distanceTo(center) > 50;
      
      if (zoomChanged || centerChanged) {
        map.flyTo(center, zoom, {
          duration: 1.5
        });
      }
      
      lastDeviceCount.current = validDevices.length;
      lastDevicePositions.current = validDevices.map(d => ({
        lat: d.last_location.latitude,
        lng: d.last_location.longitude,
        device_id: d.device_id
      }));
      
      setTimeout(() => {
        updateInProgress.current = false;
      }, 1000);
    }
  }, [devices, userInteracting, map, campusBounds]);

  return null;
}

function CampusSectionsRenderer({ sections, campusCenterDevice }) {
  return (
    <>
      {sections.map((section) => (
        <Polygon
          key={section.id}
          positions={section.coordinates}
          pathOptions={{
            color: section.color,
            fillColor: section.color,
            fillOpacity: 0.5,
            weight: 2,
            opacity: 0.9
          }}
        >
          <Popup>
            <div className="campus-section-popup">
              <h4>🏢 {section.name}</h4>
              <p><strong>Type:</strong> <span className={`section-${section.type}`}>{section.type.toUpperCase()}</span></p>
              <p><strong>Description:</strong> {section.description}</p>
              <p><strong>Size:</strong> {section.width} × {section.height}</p>
              <p>
                <strong>Campus Center:</strong> Fixed location
              </p>
              <p>
                <strong>Campus Creator:</strong> {campusCenterDevice?.device_name || 'First Device'}
              </p>
              <p><em>Campus location is fixed and does not move with devices</em></p>
            </div>
          </Popup>
        </Polygon>
      ))}
    </>
  );
}

function CampusBoundaryRenderer({ campusBounds }) {
  if (!campusBounds) return null;

  return (
    <Rectangle
      bounds={campusBounds}
      pathOptions={{
        color: '#6366F1',
        fillColor: '#6366F1',
        fillOpacity: 0.05,
        weight: 3,
        opacity: 0.8,
        dashArray: '10, 10'
      }}
    >
      <Popup>
        <div className="campus-section-popup">
          <h4>🏫 University Campus</h4>
          <p><strong>Main Campus Area</strong></p>
          <p><strong>Fixed Location:</strong> Campus does not move with devices</p>
          <p><strong>Dimensions:</strong> 20m × 20m</p>
          <p><strong>Sections:</strong> 4 properly separated rectangular sections</p>
          <p><em>Campus center is fixed at the location where the first device registered</em></p>
        </div>
      </Popup>
    </Rectangle>
  );
}

function StableDevicesRenderer({ devices, campusManager, getMarkerColor, getStatusText, isCurrentDevice, getCurrentSection, campusCenterDeviceId, campusCenterLocation }) {
  return (
    <>
      {devices.map((device, index) => {
        const currentSection = getCurrentSection(device);
        const gpsQuality = device.last_location?.gps_quality;
        const isCampusCenterDevice = campusCenterDeviceId && device.device_id === campusCenterDeviceId;
        const simulatedMovement = device.simulated_movement || false;
        
        return (
          <Marker
            key={`${device.device_id}-${index}`}
            position={[device.last_location.latitude, device.last_location.longitude]}
            icon={createAdvancedDirectionalIcon(
              getMarkerColor(device), 
              device.last_location.heading || 0,
              device.last_location.speed || 0,
              device.is_mobile,
              isCurrentDevice(device),
              gpsQuality,
              simulatedMovement,
              isCampusCenterDevice
            )}
          >
            <Popup>
              <div className="popup-content">
                <strong>{device.device_name || `Device ${index + 1}`}</strong>
                {isCampusCenterDevice && (
                  <div style={{
                    background: '#6366F1',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    margin: '5px 0'
                  }}>
                    🏫 CAMPUS CREATOR
                  </div>
                )}
                <div className="popup-details">
                  <div><strong>Type:</strong> {device.is_mobile ? '📱 Mobile' : '💻 Computer'}</div>
                  <div><strong>Status:</strong> {getStatusText(device)}</div>
                  {simulatedMovement && (
                    <div>
                      <strong>Simulated Movement:</strong> 
                      <span style={{color: '#10B981', fontWeight: 'bold'}}> Active</span>
                      <br/>
                      <small>Network location with simulated movement for better UX</small>
                    </div>
                  )}
                  {gpsQuality && (
                    <div>
                      <strong>GPS Quality:</strong> 
                      <span className={`gps-quality ${gpsQuality}`} style={{marginLeft: '5px'}}>
                        {gpsQuality.toUpperCase()}
                      </span>
                    </div>
                  )}
                  {currentSection && (
                    <div>
                      <strong>Location:</strong> {currentSection.name}
                      <span style={{color: currentSection.color, fontWeight: 'bold'}}> • {currentSection.type.toUpperCase()}</span>
                      <br/>
                      <small>Inside {currentSection.width} × {currentSection.height} section</small>
                    </div>
                  )}
                  {!currentSection && campusManager && campusManager.isInCampus(
                    device.last_location.latitude, 
                    device.last_location.longitude
                  ) && (
                    <div><strong>Location:</strong> On Campus (Between sections)</div>
                  )}
                  {!currentSection && campusManager && !campusManager.isInCampus(
                    device.last_location.latitude, 
                    device.last_location.longitude
                  ) && (
                    <div><strong>Location:</strong> Outside Campus</div>
                  )}
                  <div><strong>Coordinates:</strong> {device.last_location.latitude.toFixed(6)}, {device.last_location.longitude.toFixed(6)}</div>
                  {device.last_location.accuracy && (
                    <div><strong>Accuracy:</strong> ±{Math.round(device.last_location.accuracy)}m</div>
                  )}
                  {device.last_location.heading && (
                    <div><strong>Heading:</strong> {device.last_location.heading.toFixed(1)}°</div>
                  )}
                  {device.last_location.speed > 0 && (
                    <div><strong>Speed:</strong> {(device.last_location.speed * 3.6).toFixed(1)} km/h</div>
                  )}
                  {isCurrentDevice(device) && (
                    <div><strong>📍 Current Device - Live Tracking</strong></div>
                  )}
                  {isCampusCenterDevice && campusCenterLocation && (
                    <div style={{marginTop: '5px', padding: '5px', background: '#f0f9ff', borderRadius: '4px'}}>
                      <small>
                        <strong>Campus Center:</strong> Fixed at (Lat: {campusCenterLocation.latitude.toFixed(6)}, Lng: {campusCenterLocation.longitude.toFixed(6)})
                      </small>
                    </div>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

const shouldUpdateMap = (currentDevices, lastPositions, lastCount) => {
  if (Math.abs(currentDevices.length - lastCount) > 0) return true;
  if (lastPositions.length === 0) return true;

  const significantMoveThreshold = 0.00001;
  
  for (const currentDevice of currentDevices) {
    const lastPosition = lastPositions.find(pos => pos.device_id === currentDevice.device_id);
    if (lastPosition) {
      const latDiff = Math.abs(currentDevice.last_location.latitude - lastPosition.lat);
      const lngDiff = Math.abs(currentDevice.last_location.longitude - lastPosition.lng);
      
      if (latDiff > significantMoveThreshold || lngDiff > significantMoveThreshold) {
        return true;
      }
    } else {
      return true;
    }
  }

  return false;
};

const calculateMapCenter = (validDevices) => {
  if (validDevices.length === 0) return null;
  if (validDevices.length === 1) {
    const device = validDevices[0];
    return [device.last_location.latitude, device.last_location.longitude];
  }
  
  const lats = validDevices.map(d => d.last_location.latitude);
  const lons = validDevices.map(d => d.last_location.longitude);
  
  const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;
  
  return [centerLat, centerLon];
};

const calculateZoom = (validDevices) => {
  if (validDevices.length <= 1) return 20;
  if (validDevices.length === 2) return 19;
  if (validDevices.length <= 5) return 18;
  return 17;
};

const MapView = ({ devices, userLocation }) => {
  const [userInteracting, setUserInteracting] = useState(false);
  const [campusManager, setCampusManager] = useState(null);
  const [campusSections, setCampusSections] = useState([]);
  const [campusBounds, setCampusBounds] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [campusCenterLocation, setCampusCenterLocation] = useState(null);
  const [campusCenterDeviceId, setCampusCenterDeviceId] = useState(null);
  const [firstDevice, setFirstDevice] = useState(null);

  useEffect(() => {
    if (devices.length > 0) {
      let firstDeviceCandidate = null;
      let earliestTime = Infinity;
      
      devices.forEach((device, index) => {
        let deviceTime = Infinity;
        
        if (device.created_at) {
          try {
            const time = new Date(device.created_at).getTime();
            if (!isNaN(time) && time < earliestTime) {
              earliestTime = time;
              firstDeviceCandidate = device;
            }
          } catch (e) {
            console.log('Could not parse created_at for device:', device.device_id);
          }
        }
        
        if (!firstDeviceCandidate && index === 0) {
          firstDeviceCandidate = device;
        }
      });
      
      if (firstDeviceCandidate) {
        setFirstDevice(firstDeviceCandidate);
        
        const savedCampusCenter = localStorage.getItem('campus_center');
        if (!savedCampusCenter && firstDeviceCandidate.last_location) {
          const campusCenterData = {
            latitude: firstDeviceCandidate.last_location.latitude,
            longitude: firstDeviceCandidate.last_location.longitude,
            device_id: firstDeviceCandidate.device_id,
            device_name: firstDeviceCandidate.device_name,
            timestamp: Date.now()
          };
          
          localStorage.setItem('campus_center', JSON.stringify(campusCenterData));
          setCampusCenterLocation({
            latitude: campusCenterData.latitude,
            longitude: campusCenterData.longitude
          });
          setCampusCenterDeviceId(campusCenterData.device_id);
          console.log('Saved new campus center location:', campusCenterData);
        }
      }
    }
  }, [devices]);

  useEffect(() => {
    const savedCampusCenter = localStorage.getItem('campus_center');
    if (savedCampusCenter) {
      try {
        const centerData = JSON.parse(savedCampusCenter);
        setCampusCenterLocation({
          latitude: centerData.latitude,
          longitude: centerData.longitude
        });
        setCampusCenterDeviceId(centerData.device_id);
        console.log('Loaded campus center from storage:', centerData);
      } catch (e) {
        console.error('Failed to parse saved campus center:', e);
      }
    }
  }, []);

  useEffect(() => {
    let campusLocation = null;
    
    if (campusCenterLocation) {
      campusLocation = campusCenterLocation;
    } else if (firstDevice && firstDevice.last_location) {
      campusLocation = firstDevice.last_location;
    } else if (userLocation) {
      campusLocation = userLocation;
    }
    
    if (config.CAMPUS_SETTINGS.AUTO_CREATE_CAMPUS && campusLocation) {
      try {
        console.log('Creating campus at fixed location:', campusLocation);
        const manager = new CampusManager(campusLocation);
        setCampusManager(manager);
        setCampusSections(manager.sections);
        setCampusBounds(manager.campusBounds);
      } catch (error) {
        console.error('Error creating campus sections:', error);
      }
    }
  }, [campusCenterLocation, firstDevice, userLocation]);

  const validDevices = devices.filter(device => 
    device.last_location && 
    device.last_location.latitude && 
    device.last_location.longitude
  );

  const handleUserInteraction = (interacting) => {
    setUserInteracting(interacting);
  };

  const handleMapReady = () => {
    setMapReady(true);
  };

  const getMarkerColor = (device) => {
    if (!device.last_updated) return '#6b7280';
    
    const lastUpdate = new Date(device.last_updated);
    const now = new Date();
    const diffSeconds = (now - lastUpdate) / 1000;
    
    if (diffSeconds > 30) return '#dc2626';
    if (diffSeconds > 15) return '#d97706';
    return '#059669';
  };

  const getStatusText = (device) => {
    if (!device.last_updated) return 'Offline';
    
    const lastUpdate = new Date(device.last_updated);
    const now = new Date();
    const diffSeconds = (now - lastUpdate) / 1000;
    
    if (diffSeconds > 30) return 'Offline';
    if (diffSeconds > 15) return 'Stale';
    return 'Live';
  };

  const isCurrentDevice = (device) => {
    return device.is_mobile && device.last_location?.speed !== undefined;
  };

  const getCurrentSection = (device) => {
    if (!campusManager || !device.last_location) return null;
    return campusManager.getCurrentSection(
      device.last_location.latitude,
      device.last_location.longitude
    );
  };

  const getInitialCenter = () => {
    if (campusCenterLocation) {
      return [campusCenterLocation.latitude, campusCenterLocation.longitude];
    }
    if (validDevices.length > 0) {
      return [validDevices[0].last_location.latitude, validDevices[0].last_location.longitude];
    }
    if (userLocation) {
      return [userLocation.latitude, userLocation.longitude];
    }
    return [6.9271, 79.8612];
  };

  const getCampusCenterDevice = () => {
    if (!campusCenterDeviceId) return firstDevice;
    
    return devices.find(device => 
      device.device_id === campusCenterDeviceId
    ) || firstDevice;
  };

  const campusCenterDevice = getCampusCenterDevice();

  return (
    <MapContainer
      center={getInitialCenter()}
      zoom={19}
      minZoom={16}
      maxZoom={22}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={true}
      zoomControl={true}
      doubleClickZoom={true}
      zoomSnap={0.5}
      zoomDelta={0.5}
      wheelPxPerZoomLevel={60}
      preferCanvas={true}
    >
      <InitialAutoCenter 
        devices={validDevices} 
        campusBounds={campusBounds} 
        onMapReady={handleMapReady}
      />
      <MapController onUserInteraction={handleUserInteraction} />
      
      {mapReady && (
        <StableMapUpdater 
          devices={devices} 
          userInteracting={userInteracting} 
          campusBounds={campusBounds} 
        />
      )}
      
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={22}
        updateWhenIdle={true}
        updateWhenZooming={false}
      />

      {campusBounds && config.CAMPUS_SETTINGS.AUTO_CREATE_CAMPUS && (
        <CampusBoundaryRenderer campusBounds={campusBounds} />
      )}
      
      {campusSections.length > 0 && (
        <CampusSectionsRenderer 
          sections={campusSections} 
          campusCenterDevice={campusCenterDevice}
        />
      )}
      
      {validDevices.length > 0 && (
        <StableDevicesRenderer
          devices={validDevices}
          campusManager={campusManager}
          getMarkerColor={getMarkerColor}
          getStatusText={getStatusText}
          isCurrentDevice={isCurrentDevice}
          getCurrentSection={getCurrentSection}
          campusCenterDeviceId={campusCenterDeviceId}
          campusCenterLocation={campusCenterLocation}
        />
      )}

      {validDevices.length === 0 && (
        <Marker position={getInitialCenter()}>
          <Popup>
            <div className="popup-content">
              <strong>No Active Devices</strong>
              <div className="popup-details">
                <p>Waiting for device location updates...</p>
                {campusCenterLocation && (
                  <p><strong>Campus Center:</strong> Fixed at saved location (Lat: {campusCenterLocation.latitude.toFixed(6)}, Lng: {campusCenterLocation.longitude.toFixed(6)})</p>
                )}
              </div>
            </div>
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
};

export default MapView;