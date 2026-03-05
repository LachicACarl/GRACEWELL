import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import './AdminDashboard.css';
import { apiClient } from '../utils/authService';
import { supabaseClient } from '../utils/realtime';
import { formatDate, formatDateTime, getTimezoneDisplay } from '../utils/timezoneUtils';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

const AdminDashboard = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [dateFilter, setDateFilter] = useState('today');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [stats, setStats] = useState(null);
  const [employees, setEmployees] = useState([]);

  const formatIsoDate = (value) => value.toISOString().split('T')[0];

  const getDateRange = useCallback(() => {
    const end = new Date(selectedDate);
    const start = new Date(selectedDate);

    if (dateFilter === 'week') {
      start.setDate(end.getDate() - 6);
    } else if (dateFilter === 'month') {
      start.setDate(end.getDate() - 29);
    }

    return {
      startDate: formatIsoDate(start),
      endDate: formatIsoDate(end)
    };
  }, [dateFilter, selectedDate]);

  const fetchDashboardStats = useCallback(async () => {
    try {
      const { startDate, endDate } = getDateRange();
      const params = new URLSearchParams({ startDate, endDate });
      const { data } = await apiClient.get(`/dashboard/stats?${params.toString()}`);
      setStats(data?.stats || null);
    } catch (error) {
      console.error('Failed to fetch dashboard stats:', error);
    }
  }, [getDateRange]);

  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  // Realtime updates
  useEffect(() => {
    if (!supabaseClient) return undefined;

    const refreshStats = () => {
      fetchDashboardStats();
    };

    const channel = supabaseClient
      .channel('dashboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, refreshStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'salary_records' }, refreshStats)
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
  }, [fetchDashboardStats]);

  const formattedDate = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const shiftDate = (days) => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(prev.getDate() + days);
      return next;
    });
  };

  const setFilterAndDate = (filter) => {
    setDateFilter(filter);
    const today = new Date();

    if (filter === 'today') {
      setSelectedDate(today);
    } else if (filter === 'week') {
      setSelectedDate(today);
    } else if (filter === 'month') {
      setSelectedDate(today);
    }
  };

  const attendancePresent = stats?.present_count ?? stats?.today_present ?? 0;
  const attendanceAbsent = stats?.absent_count ?? Math.max(0, (stats?.total_employees || 0) - attendancePresent);
  const attendanceTotal = attendancePresent + attendanceAbsent;
  const attendancePresentPct = attendanceTotal > 0
    ? Math.round((attendancePresent / attendanceTotal) * 100)
    : 0;

  const salaryPending = stats?.pending_amount || 0;
  const salaryReleased = stats?.released_amount || 0;
  const salaryTotal = salaryPending + salaryReleased;
  const salaryReleasedPct = salaryTotal > 0
    ? Math.round((salaryReleased / salaryTotal) * 100)
    : 0;

  // Helper function to calculate percentage for tooltip
  const calculatePercentage = (value, total) => {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  };

  // Attendance chart tooltip configuration
  const attendanceTooltipConfig = {
    plugins: {
      tooltip: {
        enabled: true,
        callbacks: {
          label: function (context) {
            const label = context.label || '';
            const value = context.raw || 0;
            const total = attendanceTotal || 1;
            const pct = calculatePercentage(value, total);
            return `${label}: ${value} (${pct}%)`;
          }
        }
      },
      legend: {
        position: 'bottom',
      }
    }
  };

  // Salary chart tooltip configuration
  const salaryTooltipConfig = {
    plugins: {
      tooltip: {
        enabled: true,
        callbacks: {
          label: function (context) {
            const label = context.label || '';
            const value = context.raw || 0;
            const total = salaryTotal || 1;
            const pct = calculatePercentage(value, total);
            return `${label}: ${value} (${pct}%)`;
          }
        }
      },
      legend: {
        position: 'bottom',
      }
    }
  };

  return (
    <div className="admin-container">
      <Navbar user={user} onLogout={onLogout} />
      
      <div className="container">
        <div className="welcome-section">
          <h1>Welcome, {user?.employeeName || 'Admin'}</h1>
          
          <div className="filter-section">
            <span className="filter-label">Filter by Date:</span>
            <div className="filter-action-row">
              <div className="filter-buttons">
                <button 
                  className={dateFilter === 'today' ? 'active' : ''} 
                  onClick={() => setFilterAndDate('today')}
                >
                  Today
                </button>
                <button 
                  className={dateFilter === 'week' ? 'active' : ''} 
                  onClick={() => setFilterAndDate('week')}
                >
                  Last Week
                </button>
                <button 
                  className={dateFilter === 'month' ? 'active' : ''} 
                  onClick={() => setFilterAndDate('month')}
                >
                  Last Month
                </button>
              </div>
              <span className="filter-divider" aria-hidden="true">|</span>
              <div className="date-controls">
                <button className="nav-btn" aria-label="Previous date" onClick={() => shiftDate(-1)}>‹</button>
                <div className="date-display">
                  <span>{formattedDate}</span>
                </div>
                <button className="nav-btn" aria-label="Next date" onClick={() => shiftDate(1)}>›</button>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="charts-container">
            <div 
              className="chart-card attendance-card"
              onClick={() => navigate('/attendance')}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => e.key === 'Enter' && navigate('/attendance')}
            >
              <h3>Attendance Status</h3>
              {stats && (
                <div className="donut-chart-shell">
                  <Doughnut 
                    data={{
                      labels: ['Present', 'Absent'],
                      datasets: [{
                        label: 'Employee Attendance',
                        data: [attendancePresent, attendanceAbsent],
                        backgroundColor: ['#4CAF50', '#FF6B6B'],
                        borderColor: ['#fff', '#fff'],
                        borderWidth: 2,
                      }]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: true,
                      ...attendanceTooltipConfig
                    }}
                  />
                  <div className="donut-center-label" aria-label={`${attendancePresentPct}% Present`}>
                    <strong>{attendancePresentPct}%</strong>
                    <span>Present</span>
                  </div>
                </div>
              )}
            </div>

            <div 
              className="chart-card salary-card"
              onClick={() => navigate('/salary')}
              role="button"
              tabIndex={0}
              onKeyPress={(e) => e.key === 'Enter' && navigate('/salary')}
            >
              <h3>Salary Status</h3>
              {stats && (
                <div className="donut-chart-shell">
                  <Doughnut 
                    data={{
                      labels: ['Pending', 'Released'],
                      datasets: [{
                        label: 'Salary Distribution',
                        data: [salaryPending, salaryReleased],
                        backgroundColor: ['#FFC107', '#2196F3'],
                        borderColor: ['#fff', '#fff'],
                        borderWidth: 2,
                      }]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: true,
                      ...salaryTooltipConfig
                    }}
                  />
                  <div className="donut-center-label" aria-label={`${salaryReleasedPct}% Released`}>
                    <strong>{salaryReleasedPct}%</strong>
                    <span>Released</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
