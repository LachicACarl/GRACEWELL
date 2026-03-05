import React, { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import './QRCodeGenerator.css';
import { apiClient } from '../utils/authService';

const QRCodeGenerator = () => {
  const [employees, setEmployees] = useState([]);
  const [qrCodes, setQrCodes] = useState({});
  const [loading, setLoading] = useState(false);
  const [activeQrEmployee, setActiveQrEmployee] = useState(null);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const { data } = await apiClient.get('/employees');
      const employeesData = (data?.employees || []).map((emp) => ({
        id: emp.employee_id,
        dbId: emp.id,
        name: emp.name,
        department: emp.department,
        qrCode: emp.qr_code,
        qrImageUrl: emp.qr_image_url
      }));
      setEmployees(employeesData);
    } catch (error) {
      console.error('Error fetching employees:', error);
      // Fallback to mock data if API fails
      setEmployees([
        { id: 'E001', name: 'John Smith', department: 'IT' },
        { id: 'E002', name: 'Sarah Johnson', department: 'HR' },
        { id: 'E003', name: 'Mike Davis', department: 'PM' },
        { id: 'E004', name: 'Emily Brown', department: 'Design' },
        { id: 'E005', name: 'Robert Wilson', department: 'Business' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const generateQRCode = async (employeeId) => {
    try {
      const { data } = await apiClient.post('/qr/generate', {
        employeeId: employeeId,
        type: 'attendance'
      });
      if (data?.qrCode) {
        setQrCodes(prev => ({
          ...prev,
          [employeeId]: data.qrCode
        }));
      }
    } catch (error) {
      console.error('Error generating QR code:', error);
    }
  };

  const downloadQRCode = (id, name, elementId = `qr-${id}`) => {
    const qrElement = document.getElementById(elementId);
    if (qrElement) {
      const canvas = qrElement.querySelector('canvas');
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${id}-${name}.png`;
      link.click();
    }
  };

  const printAllQRCodes = () => {
    window.print();
  };

  return (
    <div className="qr-generator-container">
      <div className="qr-header">
        <h1>🔗 QR Code Generator</h1>
        <p>Generate and manage employee QR codes for attendance scanner</p>
        <button className="print-btn" onClick={() => window.print()}>
          🖨️ Print All QR Codes
        </button>
      </div>

      <div className="qr-info-box">
        <h3>📌 How to Use:</h3>
        <ul>
          <li><strong>For Attendance Scanner:</strong> Generate QR codes for employees</li>
          <li><strong>QR Codes are valid for:</strong> Attendance scanning and authentication</li>
          <li><strong>Each code contains:</strong> Employee ID and timestamp data</li>
        </ul>
      </div>

      <div className="qr-section-title">
        <h2>👥 Employee QR Codes</h2>
        <p>Generate and download QR codes for attendance tracking</p>
      </div>

      {loading ? (
        <div className="loading-state">Loading employees...</div>
      ) : (
        <div className="qr-grid">
          {employees.map((emp) => (
            <div key={emp.id} className="qr-card">
              <div
                className="qr-code-wrapper clickable"
                id={`qr-${emp.id}`}
                role="button"
                tabIndex={0}
                onClick={() => setActiveQrEmployee(emp)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setActiveQrEmployee(emp);
                  }
                }}
              >
                <QRCodeCanvas 
                  value={emp.qrCode || emp.id} 
                  size={200}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <div className="qr-info">
                <h3>{emp.name}</h3>
                <p className="emp-id">{emp.id}</p>
                <p className="emp-dept">{emp.department || 'N/A'}</p>
                <button 
                  className="download-btn"
                  onClick={() => downloadQRCode(emp.id, emp.name)}
                >
                  ⬇️ Download
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="qr-instructions">
        <h3>📋 Instructions:</h3>
        <ol>
          <li>Click <strong>"Print All QR Codes"</strong> to print all QR codes</li>
          <li>Or click <strong>"Download"</strong> on individual cards</li>
          <li>Display the QR code in front of your camera</li>
          <li>The scanner will automatically detect and process it</li>
        </ol>
      </div>

      {activeQrEmployee && (
        <div className="qr-modal-overlay" onClick={() => setActiveQrEmployee(null)}>
          <div className="qr-modal" onClick={(event) => event.stopPropagation()}>
            <div className="qr-modal-header">
              <h3>Employee QR Code</h3>
              <button className="qr-modal-close" onClick={() => setActiveQrEmployee(null)}>×</button>
            </div>
            <div className="qr-modal-body">
              <div className="qr-modal-meta">
                <div className="qr-modal-name">{activeQrEmployee.name}</div>
                <div className="qr-modal-id">ID: {activeQrEmployee.id}</div>
              </div>
              <div className="qr-code-wrapper" id={`qr-modal-${activeQrEmployee.id}`}>
                <QRCodeCanvas
                  value={activeQrEmployee.qrCode || activeQrEmployee.id}
                  size={320}
                  level="H"
                  includeMargin={true}
                />
              </div>
            </div>
            <div className="qr-modal-footer">
              <button
                className="download-btn"
                onClick={() => downloadQRCode(activeQrEmployee.id, activeQrEmployee.name, `qr-modal-${activeQrEmployee.id}`)}
              >
                ⬇️ Download PNG
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QRCodeGenerator;
