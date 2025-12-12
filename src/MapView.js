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

const createDeviceIcon = (color, isMobile, status) => {
  const size = isMobile ? 32 : 28;
  const pulseAnimation = status === 'safe' ? `
    @keyframes pulse {
      0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
      50% { transform: translate(-50%, -50%) scale(1.1); opacity: 0.8; }
      100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    }
  ` : '';

  const statusIndicator = status === 'safe' ? `
    <div style="
      position: absolute;
      top: -3px;
      right: -3px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #10B981;
      border: 2px solid white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    "></div>
  ` : status === 'warning' ? `
    <div style="
      position: absolute;
      top: -3px;
      right: -3px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #F59E0B;
      border: 2px solid white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    "></div>
  ` : `
    <div style="
      position: absolute;
      top: -3px;
      right: -3px;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #EF4444;
      border: 2px solid white;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      opacity: 0.7;
    "></div>
  `;

  if (isMobile) {
    return L.divIcon({
      className: 'mobile-device-icon',
      html: `
        <style>${pulseAnimation}</style>
        <div style="
          position: relative;
          width: ${size}px;
          height: ${size}px;
        ">
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
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          "></div>
          ${statusIndicator}
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size/2, size/2],
    });
  }

  // Desktop icon
  return L.divIcon({
    className: 'desktop-device-icon',
    html: `
      <style>${pulseAnimation}</style>
      <div style="
        position: relative;
        width: ${size}px;
        height: ${size}px;
      ">
        <div style="
          width: ${size - 6}px;
          height: ${size - 6}px;
          background: ${color};
          border: 2px solid white;
          border-radius: 4px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        "></div>
        ${statusIndicator}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size/2, size/2],
  });
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

function InitialAutoCenter({ devices, onMapReady }) {
  const map = useMap();
  const hasCentered = useRef(false);

  useEffect(() => {
    if (!hasCentered.current && devices.length > 0) {
      const validDevices = devices.filter(device => 
        device.last_location && 
        device.last_location.latitude && 
        device.last_location.longitude
      );

      if (validDevices.length > 0) {
        const center = calculateMapCenter(validDevices);
        const zoom = calculateZoom(validDevices);
        
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
  }, [devices, map, onMapReady]);

  return null;
}

function StableMapUpdater({ devices, userInteracting }) {
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
  }, [devices, userInteracting, map]);

  return null;
}

function CampusSectionsRenderer({ sections }) {
  if (!sections || sections.length === 0) return null;

  return (
    <>
      {sections.map((section) => (
        <Polygon
          key={section.id}
          positions={section.coordinates}
          pathOptions={{
            color: section.color,
            fillColor: section.color,
            fillOpacity: 0.3,
            weight: 2,
            opacity: 0.7
          }}
        >
          <Popup>
            <div className="campus-section-popup">
              <h4>{section.name}</h4>
              <p><strong>Type:</strong> {section.type.toUpperCase()}</p>
              <p><strong>Description:</strong> {section.description}</p>
              <p><strong>Size:</strong> {section.width} × {section.height}</p>
            </div>
          </Popup>
        </Polygon>
      ))}
    </>
  );
}

const shouldUpdateMap = (currentDevices, lastPositions, lastCount) => {
  if (Math.abs(currentDevices.length - lastCount) > 0) return true;
  if (lastPositions.length === 0) return true;

  const significantMoveThreshold = 0.0001;
  
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
  if (validDevices.length === 0) return [6.9271, 79.8612];
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
  if (validDevices.length <= 1) return 19;
  if (validDevices.length === 2) return 18;
  if (validDevices.length <= 5) return 17;
  return 16;
};

const MapView = ({ devices, userLocation }) => {
  const [userInteracting, setUserInteracting] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [campusSections, setCampusSections] = useState([]);

  useEffect(() => {
    // Create campus sections based on first device or user location
    const baseLocation = userLocation || { latitude: 6.9271, longitude: 79.8612 };
    
    const sections = [
      {
        id: 'library',
        name: 'Library Section',
        type: 'library',
        color: '#3B82F6',
        coordinates: [
          [baseLocation.latitude + 0.0001, baseLocation.longitude - 0.0001],
          [baseLocation.latitude + 0.0001, baseLocation.longitude + 0.0001],
          [baseLocation.latitude - 0.0001, baseLocation.longitude + 0.0001],
          [baseLocation.latitude - 0.0001, baseLocation.longitude - 0.0001]
        ],
        description: 'Library and study area',
        width: '20m',
        height: '20m'
      },
      {
        id: 'lab',
        name: 'Laboratory Section',
        type: 'lab',
        color: '#10B981',
        coordinates: [
          [baseLocation.latitude + 0.0001, baseLocation.longitude + 0.0002],
          [baseLocation.latitude + 0.0001, baseLocation.longitude + 0.0004],
          [baseLocation.latitude - 0.0001, baseLocation.longitude + 0.0004],
          [baseLocation.latitude - 0.0001, baseLocation.longitude + 0.0002]
        ],
        description: 'Science and computer labs',
        width: '20m',
        height: '20m'
      }
    ];
    
    setCampusSections(sections);
  }, [userLocation]);

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
    const status = device.display_status || 'offline';
    switch(status) {
      case 'safe': return '#10B981';
      case 'warning': return '#F59E0B';
      case 'offline': return '#6B7280';
      default: return '#6B7280';
    }
  };

  const getInitialCenter = () => {
    if (validDevices.length > 0) {
      return [validDevices[0].last_location.latitude, validDevices[0].last_location.longitude];
    }
    if (userLocation) {
      return [userLocation.latitude, userLocation.longitude];
    }
    return [6.9271, 79.8612];
  };

  return (
    <MapContainer
      center={getInitialCenter()}
      zoom={18}
      minZoom={16}
      maxZoom={22}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={true}
      zoomControl={true}
      doubleClickZoom={true}
    >
      <InitialAutoCenter 
        devices={validDevices} 
        onMapReady={handleMapReady}
      />
      <MapController onUserInteraction={handleUserInteraction} />
      
      {mapReady && (
        <StableMapUpdater 
          devices={devices} 
          userInteracting={userInteracting} 
        />
      )}
      
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        maxZoom={22}
      />

      <CampusSectionsRenderer sections={campusSections} />
      
      {validDevices.map((device, index) => (
        <Marker
          key={`${device.device_id}-${index}`}
          position={[device.last_location.latitude, device.last_location.longitude]}
          icon={createDeviceIcon(
            getMarkerColor(device),
            device.is_mobile,
            device.display_status || 'offline'
          )}
        >
          <Popup>
            <div className="popup-content">
              <strong>{device.device_name || `Device ${index + 1}`}</strong>
              <div className="popup-details">
                <div><strong>Type:</strong> {device.is_mobile ? '📱 Mobile' : '💻 Computer'}</div>
                <div><strong>Status:</strong> {device.display_status || 'offline'}</div>
                <div><strong>Location:</strong> {device.last_location.city || 'Unknown area'}</div>
                <div><strong>Coordinates:</strong> {device.last_location.latitude.toFixed(6)}, {device.last_location.longitude.toFixed(6)}</div>
                {device.last_location.accuracy && (
                  <div><strong>Accuracy:</strong> ±{Math.round(device.last_location.accuracy)}m</div>
                )}
                {device.last_updated && (
                  <div><strong>Last Update:</strong> {new Date(device.last_updated).toLocaleTimeString()}</div>
                )}
              </div>
            </div>
          </Popup>
        </Marker>
      ))}

      {validDevices.length === 0 && (
        <Marker position={getInitialCenter()}>
          <Popup>
            <div className="popup-content">
              <strong>No Active Devices</strong>
              <div className="popup-details">
                <p>Waiting for device location updates...</p>
              </div>
            </div>
          </Popup>
        </Marker>
      )}
    </MapContainer>
  );
};

export default MapView;