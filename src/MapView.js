import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icons
const createCustomIcon = (isMobile, isOnline) => {
  const color = isOnline ? (isMobile ? '#e74c3c' : '#3498db') : '#95a5a6';
  
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background: ${color};
        width: 20px;
        height: 20px;
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

// Component to auto-center map when devices change
function MapUpdater({ devices }) {
  const map = useMap();
  
  useEffect(() => {
    const validDevices = devices.filter(device => 
      device.last_location && 
      device.last_location.latitude && 
      device.last_location.longitude
    );

    if (validDevices.length > 0) {
      const group = new L.featureGroup(
        validDevices.map(device => 
          L.marker([device.last_location.latitude, device.last_location.longitude])
        )
      );
      
      map.fitBounds(group.getBounds(), { padding: [20, 20] });
    } else {
      // Default to campus location if no devices
      map.setView([6.9271, 79.8612], 17);
    }
  }, [devices, map]);

  return null;
}

const MapView = ({ devices, userLocation }) => {
  const [campusLocation] = useState([6.9271, 79.8612]); // Default campus location

  const getDeviceStatus = (device) => {
    if (!device.last_updated) return false;
    
    const lastUpdate = new Date(device.last_updated);
    const now = new Date();
    const diffSeconds = (now - lastUpdate) / 1000;
    
    return diffSeconds <= 30; // Online if updated within 30 seconds
  };

  const styles = {
    container: {
      height: '400px',
      width: '100%',
      borderRadius: '10px',
      overflow: 'hidden',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
    }
  };

  return (
    <div style={styles.container}>
      <MapContainer
        center={campusLocation}
        zoom={17}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        <MapUpdater devices={devices} />
        
        {/* Campus area marker */}
        <Marker position={campusLocation}>
          <Popup>
            <div style={{ textAlign: 'center' }}>
              <strong>🏫 University Campus</strong>
              <br />
              Device Tracking Area
            </div>
          </Popup>
        </Marker>

        {/* Device markers */}
        {devices
          .filter(device => device.last_location && device.last_location.latitude && device.last_location.longitude)
          .map((device) => {
            const isOnline = getDeviceStatus(device);
            const position = [device.last_location.latitude, device.last_location.longitude];
            
            return (
              <Marker
                key={device.device_id}
                position={position}
                icon={createCustomIcon(device.is_mobile, isOnline)}
              >
                <Popup>
                  <div style={{ minWidth: '200px' }}>
                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      marginBottom: '8px',
                      padding: '5px',
                      background: device.is_mobile ? '#ffeaa7' : '#dfe6e9',
                      borderRadius: '5px'
                    }}>
                      <span style={{ fontSize: '20px', marginRight: '8px' }}>
                        {device.is_mobile ? '📱' : '💻'}
                      </span>
                      <div>
                        <strong>{device.device_name || 'Unnamed Device'}</strong>
                        <div style={{ 
                          fontSize: '12px', 
                          color: isOnline ? '#27ae60' : '#e74c3c',
                          fontWeight: 'bold'
                        }}>
                          {isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}
                        </div>
                      </div>
                    </div>
                    
                    <div style={{ fontSize: '14px' }}>
                      <div><strong>Type:</strong> {device.device_type}</div>
                      <div><strong>Location Source:</strong> {device.last_location.source || 'Unknown'}</div>
                      <div><strong>Accuracy:</strong> {device.last_location.accuracy ? `±${Math.round(device.last_location.accuracy)}m` : 'Unknown'}</div>
                      <div><strong>Coordinates:</strong></div>
                      <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>
                        {device.last_location.latitude.toFixed(6)}, {device.last_location.longitude.toFixed(6)}
                      </div>
                      <div><strong>Last Update:</strong></div>
                      <div style={{ fontSize: '12px' }}>
                        {new Date(device.last_updated).toLocaleTimeString()}
                      </div>
                    </div>
                    
                    {device.last_location.heading && (
                      <div style={{ marginTop: '5px', fontSize: '12px' }}>
                        <strong>Heading:</strong> {device.last_location.heading.toFixed(1)}°
                      </div>
                    )}
                    
                    {device.last_location.speed > 0 && (
                      <div style={{ fontSize: '12px' }}>
                        <strong>Speed:</strong> {(device.last_location.speed * 3.6).toFixed(1)} km/h
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
      </MapContainer>
    </div>
  );
};

export default MapView;