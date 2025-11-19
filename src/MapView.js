import React from 'react';

const MapView = ({ devices, userLocation }) => {
  const styles = {
    container: {
      height: '400px',
      background: 'linear-gradient(135deg, #74b9ff 0%, #0984e3 100%)',
      borderRadius: '10px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      position: 'relative',
      overflow: 'hidden'
    },
    deviceMarker: {
      position: 'absolute',
      width: '12px',
      height: '12px',
      background: '#00b894',
      border: '2px solid white',
      borderRadius: '50%',
      transform: 'translate(-50%, -50%)'
    },
    campusZone: {
      position: 'absolute',
      border: '2px dashed rgba(255,255,255,0.5)',
      background: 'rgba(255,255,255,0.1)'
    }
  };

  // Simple campus zones
  const campusZones = [
    { id: 'library', name: 'Library', top: '30%', left: '25%', width: '20%', height: '15%', color: '#3498db' },
    { id: 'lab', name: 'Lab', top: '30%', left: '55%', width: '20%', height: '15%', color: '#2ecc71' },
    { id: 'classroom', name: 'Classroom', top: '60%', left: '25%', width: '20%', height: '15%', color: '#f39c12' },
    { id: 'admin', name: 'Admin', top: '60%', left: '55%', width: '20%', height: '15%', color: '#e74c3c' }
  ];

  return (
    <div style={styles.container}>
      <h3 style={{margin: '0 0 20px 0', textAlign: 'center'}}>
        Live Device Locations ({devices.filter(d => d.last_location).length} active)
      </h3>
      
      {/* Campus Zones */}
      {campusZones.map(zone => (
        <div
          key={zone.id}
          style={{
            ...styles.campusZone,
            top: zone.top,
            left: zone.left,
            width: zone.width,
            height: zone.height,
            borderColor: zone.color
          }}
        >
          <div style={{
            position: 'absolute',
            top: '-25px',
            left: '0',
            fontSize: '12px',
            color: zone.color,
            fontWeight: 'bold'
          }}>
            {zone.name}
          </div>
        </div>
      ))}
      
      {/* Device Markers */}
      {devices.filter(device => device.last_location).map((device, index) => {
        // Simple positioning based on device ID hash
        const position = {
          top: `${30 + (parseInt(device.device_id.slice(0, 8), 16) % 40)}%`,
          left: `${20 + (parseInt(device.device_id.slice(8, 16), 16) % 60)}%`
        };
        
        return (
          <div
            key={device.device_id}
            style={{
              ...styles.deviceMarker,
              ...position,
              background: device.is_mobile ? '#e74c3c' : '#3498db'
            }}
            title={`${device.device_name} - ${device.is_mobile ? 'Mobile' : 'Laptop'}`}
          />
        );
      })}
      
      <div style={{
        position: 'absolute',
        bottom: '10px',
        left: '10px',
        background: 'rgba(0,0,0,0.7)',
        padding: '10px',
        borderRadius: '5px',
        fontSize: '12px'
      }}>
        <div>📱 Mobile Devices: {devices.filter(d => d.is_mobile).length}</div>
        <div>💻 Laptop Devices: {devices.filter(d => !d.is_mobile).length}</div>
        <div>📍 Active Tracking: {devices.filter(d => d.last_location).length}</div>
      </div>
    </div>
  );
};

export default MapView;