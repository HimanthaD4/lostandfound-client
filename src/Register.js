import React, { useState } from 'react';
import { apiRequest } from './App';

const Register = ({ onRegister, onSwitchToLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    try {
      const response = await apiRequest('/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        onRegister({ email: email });
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to connect to server. Make sure backend is running on port 5000 and check your network connection.');
    }
  };

  return (
    <div className="auth-box">
      <h2 className="auth-title">Register</h2>
      {error && <div style={{color: 'red', marginBottom: '15px', textAlign: 'center'}}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <input
            type="email"
            className="form-input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <input
            type="password"
            className="form-input"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <input
            type="password"
            className="form-input"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" className="btn">Register</button>
      </form>
      <div className="auth-switch">
        Already have an account?{' '}
        <span className="auth-link" onClick={onSwitchToLogin}>
          Login here
        </span>
      </div>
    </div>
  );
};

export default Register;