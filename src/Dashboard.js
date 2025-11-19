import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from './App';
import MapView from './MapView';

const Dashboard = ({ user, onLogout }) => {
  const [devices, setDevices] = useState([]);
  const [currentDeviceId, setCurrentDeviceId] = useState(null);
  const [locationStatus, setLocationStatus] = useState('initializing');
  const [userLocation, setUserLocation] = useState(null);
  const locationWatcherRef = useRef(null);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [locationUpdates, setLocationUpdates] = useState(0);
  const deviceTrackersRef = useRef(new Map());
  const currentDeviceSessionRef = useRef(null);

  useEffect(() => {
    initializeDeviceTracking();
    fetchDevices();

    // Poll for device updates every 2 seconds
    const devicesInterval = setInterval(() => {
      fetchDevices();
    }, 2000);

    return () => {
      stopAllLocationTracking();
      clearInterval(devicesInterval);
    };
  }, [user]);

  const initializeDeviceTracking = async () => {
    const deviceId = await getCurrentDeviceId();
    setCurrentDeviceId(deviceId);
    
    currentDeviceSessionRef.current = {
      deviceId: deviceId,
      isMobile: isMobileDevice()
    };
    
    const deviceExists = await checkDeviceExists(deviceId);
    
    if (!deviceExists) {
      setLocationStatus('waiting_for_setup');
    } else {
      startIndependentLocationTracking(deviceId);
    }
  };

  const getCurrentDeviceId = async () => {
    if (user.device_info?.device_id) {
      return user.device_info.device_id;
    }
    
    const userAgent = navigator.userAgent;
    const isMobile = isMobileDevice();
    const deviceId = `device_${user.email}_${isMobile ? 'mobile' : 'laptop'}_${btoa(userAgent).slice(0, 10)}_${Date.now()}`;
    
    return deviceId;
  };

  const checkDeviceExists = async (deviceId) => {
    try {
      const response = await apiRequest(`/devices/${user.email}`);
      const userDevices = await response.json();
      return userDevices.some(device => device.device_id === deviceId);
    } catch (err) {
      return false;
    }
  };

  const isMobileDevice = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  const startIndependentLocationTracking = (deviceId) => {
    if (isMobileDevice()) {
      startMobileGPSTracking(deviceId);
    } else {
      startLaptopLocationTracking(deviceId);
    }
  };

  const startMobileGPSTracking = (deviceId) => {
    if (!navigator.geolocation) {
      startLaptopLocationTracking(deviceId);
      return;
    }

    setLocationStatus('tracking_mobile_gps');

    const updateLocation = async (position, source) => {
      await processGPSLocation(deviceId, position, source);
    };

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await updateLocation(position, 'mobile_initial');
      },
      (error) => {
        startLaptopLocationTracking(deviceId);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        await updateLocation(position, 'mobile_continuous');
      },
      (error) => {
        setTimeout(() => {
          if (locationStatus === 'tracking_mobile_gps') {
            startLaptopLocationTracking(deviceId);
          }
        }, 30000);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 1000, distanceFilter: 1 }
    );

    locationWatcherRef.current = watchId;
    deviceTrackersRef.current.set(deviceId, { type: 'gps', id: watchId });
  };

  const startLaptopLocationTracking = (deviceId) => {
    setLocationStatus('tracking_laptop');

    if (!navigator.geolocation) {
      startFallbackLocationTracking(deviceId);
      return;
    }

    const updateLaptopLocation = async (position, source) => {
      const location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading || 0,
        speed: position.coords.speed || 0,
        location_type: 'browser_geolocation',
        timestamp: new Date().toISOString(),
        source: source,
        is_mobile: false,
        device_id: deviceId
      };

      setGpsAccuracy(position.coords.accuracy);
      setLocationUpdates(prev => prev + 1);
      
      if (deviceId === currentDeviceId) {
        setUserLocation({
          latitude: location.latitude,
          longitude: location.longitude
        });
      }

      await updateDeviceLocation(deviceId, location);
    };

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await updateLaptopLocation(position, 'laptop_initial');
      },
      async (error) => {
        await startFallbackLocationTracking(deviceId);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        await updateLaptopLocation(position, 'laptop_continuous');
      },
      (error) => {
        startFallbackLocationTracking(deviceId);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000, distanceFilter: 10 }
    );

    deviceTrackersRef.current.set(deviceId, { type: 'gps', id: watchId });
  };

  const startFallbackLocationTracking = async (deviceId) => {
    setLocationStatus('tracking_fallback');
    
    const updateLocation = async () => {
      try {
        const networkLocation = await getNetworkBasedLocation();
        networkLocation.device_id = deviceId;
        await updateDeviceLocation(deviceId, networkLocation);
      } catch (error) {
        console.error('Fallback location update failed:', error);
      }
    };

    await updateLocation();
    const intervalId = setInterval(async () => {
      await updateLocation();
    }, 30000);

    deviceTrackersRef.current.set(deviceId, { type: 'interval', id: intervalId });
  };

  const processGPSLocation = async (deviceId, position, source) => {
    const location = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      heading: position.coords.heading,
      speed: position.coords.speed,
      location_type: 'gps_live_mobile',
      timestamp: new Date().toISOString(),
      source: source,
      is_mobile: true,
      device_id: deviceId
    };

    setGpsAccuracy(position.coords.accuracy);
    setLocationUpdates(prev => prev + 1);
    
    if (deviceId === currentDeviceId) {
      setUserLocation({
        latitude: location.latitude,
        longitude: location.longitude
      });
    }

    await updateDeviceLocation(deviceId, location);
  };

  const getNetworkBasedLocation = async () => {
    try {
      const response = await fetch('https://ipapi.co/json/', { timeout: 5000 });
      if (response.ok) {
        const data = await response.json();
        if (data.latitude && data.longitude) {
          return {
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: 1000,
            city: data.city || 'Unknown',
            country: data.country_name || 'Unknown',
            location_type: 'network_ip',
            timestamp: new Date().toISOString(),
            source: 'network_geolocation',
            is_mobile: false
          };
        }
      }
    } catch (error) {
      console.log('Network location service failed');
    }

    return {
      latitude: 6.9271 + (Math.random() - 0.5) * 0.001,
      longitude: 79.8612 + (Math.random() - 0.5) * 0.001,
      accuracy: 5000,
      city: 'Colombo',
      country: 'Sri Lanka',
      location_type: 'network_fallback',
      timestamp: new Date().toISOString(),
      source: 'fallback',
      is_mobile: false
    };
  };

  const updateDeviceLocation = async (deviceId, location) => {
    try {
      const response = await apiRequest('/update_device_location', {
        method: 'POST',
        body: JSON.stringify({
          email: user.email,
          device_id: deviceId,
          location: location
        }),
      });

      if (response.ok) {
        setDevices(prevDevices => {
          const updatedDevices = prevDevices.map(device => 
            device.device_id === deviceId 
              ? { 
                  ...device, 
                  last_location: location,
                  last_updated: new Date().toISOString(),
                  is_mobile: location.is_mobile || false
                }
              : device
          );
          
          const deviceExists = updatedDevices.some(device => device.device_id === deviceId);
          if (!deviceExists) {
            const newDevice = {
              device_id: deviceId,
              device_name: isMobileDevice() ? 'My Mobile Phone' : 'My Laptop',
              device_type: isMobileDevice() ? 'mobile' : 'laptop',
              last_location: location,
              last_updated: new Date().toISOString(),
              is_mobile: location.is_mobile || false
            };
            return [...updatedDevices, newDevice];
          }
          
          return updatedDevices;
        });
      }
    } catch (err) {
      console.error('Failed to update device location:', err);
    }
  };

  const stopAllLocationTracking = () => {
    if (locationWatcherRef.current) {
      navigator.geolocation.clearWatch(locationWatcherRef.current);
    }
    
    deviceTrackersRef.current.forEach((tracker, deviceId) => {
      if (tracker.type === 'gps') {
        navigator.geolocation.clearWatch(tracker.id);
      } else if (tracker.type === 'interval') {
        clearInterval(tracker.id);
      }
    });
    
    deviceTrackersRef.current.clear();
  };

  const fetchDevices = async () => {
    try {
      const response = await apiRequest(`/devices/${user.email}`);
      const data = await response.json();
      
      setDevices(data);
      
      // Start tracking for any new devices
      data.forEach(device => {
        if (!deviceTrackersRef.current.has(device.device_id) && device.device_id !== currentDeviceId) {
          startAdditionalDeviceTracking(device.device_id, device.is_mobile);
        }
      });
    } catch (err) {
      console.error('Failed to fetch devices:', err);
    }
  };

  const startAdditionalDeviceTracking = (deviceId, isMobile) => {
    if (isMobile) {
      startAdditionalMobileTracking(deviceId);
    } else {
      startAdditionalLaptopTracking(deviceId);
    }
  };

  const startAdditionalMobileTracking = (deviceId) => {
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading || 0,
          speed: position.coords.speed || 0,
          location_type: 'gps_mobile_device',
          timestamp: new Date().toISOString(),
          source: 'mobile_device_gps',
          is_mobile: true,
          device_id: deviceId
        };
        await updateDeviceLocation(deviceId, location);
      },
      (error) => {
        console.error(`GPS tracking failed for device ${deviceId}:`, error);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000, distanceFilter: 2 }
    );

    deviceTrackersRef.current.set(deviceId, { type: 'gps', id: watchId });
  };

  const startAdditionalLaptopTracking = (deviceId) => {
    if (!navigator.geolocation) {
      startFallbackLocationTracking(deviceId);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading || 0,
          speed: position.coords.speed || 0,
          location_type: 'browser_geolocation',
          timestamp: new Date().toISOString(),
          source: 'laptop_additional',
          is_mobile: false,
          device_id: deviceId
        };
        await updateDeviceLocation(deviceId, location);
      },
      (error) => {
        startFallbackLocationTracking(deviceId);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000, distanceFilter: 10 }
    );

    deviceTrackersRef.current.set(deviceId, { type: 'gps', id: watchId });
  };

  const getStatus = (device) => {
    if (!device.last_updated) return 'offline';
    
    const lastUpdate = new Date(device.last_updated);
    const now = new Date();
    const diffSeconds = (now - lastUpdate) / 1000;
    
    if (diffSeconds > 30) return 'offline';
    if (diffSeconds > 15) return 'warning';
    return 'safe';
  };

  const getLocationStatusText = () => {
    switch(locationStatus) {
      case 'tracking_mobile_gps': 
        return `📱 Mobile GPS (Accuracy: ±${gpsAccuracy ? Math.round(gpsAccuracy) : '?'}m)`;
      case 'tracking_laptop': 
        return '💻 Laptop Location';
      case 'tracking_fallback': 
        return '🌐 Network Location';
      case 'waiting_for_setup': 
        return '⏳ Waiting for Setup...';
      case 'initializing': 
        return '⚙️ Initializing...';
      default: 
        return '📍 Location Tracking';
    }
  };

  const isCurrentDevice = (device) => {
    return device.device_id === currentDeviceId;
  };

  // Simple inline styles
  const styles = {
    container: {
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'
    },
    navbar: {
      background: '#2c3e50',
      color: 'white',
      padding: '15px 30px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
    },
    content: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '20px',
      padding: '20px',
      maxWidth: '1200px',
      margin: '0 auto'
    },
    section: {
      background: 'white',
      borderRadius: '10px',
      padding: '20px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
    },
    deviceCard: {
      background: '#f8f9fa',
      border: '1px solid #e9ecef',
      borderRadius: '8px',
      padding: '15px',
      marginBottom: '10px'
    },
    status: {
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 'bold'
    },
    statusSafe: { background: '#d4edda', color: '#155724' },
    statusWarning: { background: '#fff3cd', color: '#856404' },
    statusOffline: { background: '#f8d7da', color: '#721c24' }
  };

  return (
    <div style={styles.container}>
      <nav style={styles.navbar}>
        <div>
          <h2 style={{margin: 0}}>📍 Device Tracker</h2>
          <div style={{fontSize: '14px', opacity: 0.8}}>
            {getLocationStatusText()} • Updates: {locationUpdates}
          </div>
        </div>
        <div>
          Welcome, {user.email}
          <button 
            onClick={onLogout}
            style={{
              background: 'rgba(255,255,255,0.1)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              padding: '8px 16px',
              borderRadius: '6px',
              marginLeft: '15px',
              cursor: 'pointer'
            }}
          >
            Logout
          </button>
        </div>
      </nav>

      <div style={styles.content}>
        <div style={styles.section}>
          <h3 style={{marginTop: 0}}>My Devices ({devices.length})</h3>
          {devices.map((device, index) => (
            <div key={device.device_id} style={styles.deviceCard}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <h4 style={{margin: '0 0 10px 0'}}>
                  {device.device_name || `Device ${index + 1}`} 
                  {device.is_mobile ? ' 📱' : ' 💻'}
                </h4>
                <span style={{
                  ...styles.status,
                  ...(getStatus(device) === 'safe' ? styles.statusSafe : 
                      getStatus(device) === 'warning' ? styles.statusWarning : styles.statusOffline)
                }}>
                  {getStatus(device).toUpperCase()}
                </span>
              </div>
              
              <div style={{fontSize: '14px', color: '#666'}}>
                <div><strong>Type:</strong> {device.device_type}</div>
                <div><strong>Location:</strong> {device.last_location?.city || 'Unknown'}</div>
                <div><strong>Coordinates:</strong> 
                  {device.last_location ? 
                    `${device.last_location.latitude?.toFixed(6)}, ${device.last_location.longitude?.toFixed(6)}` : 
                    'No location'
                  }
                </div>
                <div><strong>Accuracy:</strong> {device.last_location?.accuracy ? `±${Math.round(device.last_location.accuracy)}m` : 'Unknown'}</div>
                <div><strong>Last Update:</strong> {device.last_updated ? 
                  new Date(device.last_updated).toLocaleTimeString() : 'Never'
                }</div>
                
                {isCurrentDevice(device) && (
                  <div style={{marginTop: '8px', padding: '5px', background: '#e3f2fd', borderRadius: '4px', fontSize: '12px'}}>
                    ✅ Current Device - Active Tracking
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {devices.length === 0 && (
            <div style={{textAlign: 'center', padding: '40px', color: '#666'}}>
              <p>No devices found. Complete device setup to start tracking.</p>
            </div>
          )}
        </div>

 
<div style={styles.section}>
  <h3 style={{marginTop: 0}}>Live Map</h3>
  <MapView devices={devices} userLocation={userLocation} />
  
  <div style={{marginTop: '15px', fontSize: '14px', color: '#666'}}>
    <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <div style={{ width: '12px', height: '12px', background: '#e74c3c', borderRadius: '50%' }}></div>
        <span>Mobile Devices</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <div style={{ width: '12px', height: '12px', background: '#3498db', borderRadius: '50%' }}></div>
        <span>Laptop Devices</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <div style={{ width: '12px', height: '12px', background: '#95a5a6', borderRadius: '50%' }}></div>
        <span>Offline Devices</span>
      </div>
    </div>
    <p style={{ marginTop: '10px' }}>
      <strong>Active Trackers:</strong> {deviceTrackersRef.current.size} devices • 
      <strong> Updates:</strong> {locationUpdates}
    </p>
  </div>
</div>
      </div>
    </div>
  );
};

export default Dashboard;