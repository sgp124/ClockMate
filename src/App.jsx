import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';

import Landing from './pages/Landing';
import Login from './pages/Login';
import KioskScreen from './pages/kiosk/KioskScreen';

import AdminLayout from './components/layout/AdminLayout';
import Dashboard from './pages/admin/Dashboard';
import Schedule from './pages/admin/Schedule';
import Timesheets from './pages/admin/Timesheets';
import Employees from './pages/admin/Employees';
import EmployeeProfile from './pages/admin/EmployeeProfile';
import TimeOff from './pages/admin/TimeOff';
import Payroll from './pages/admin/Payroll';
import Settings from './pages/admin/Settings';

import EmployeeLayout from './components/layout/EmployeeLayout';
import MySchedule from './pages/employee/MySchedule';
import MyHours from './pages/employee/MyHours';
import MyTimeOff from './pages/employee/MyTimeOff';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/kiosk" element={<KioskScreen />} />

          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="schedule" element={<Schedule />} />
            <Route path="timesheets" element={<Timesheets />} />
            <Route path="employees" element={<Employees />} />
            <Route path="employees/:id" element={<EmployeeProfile />} />
            <Route path="time-off" element={<TimeOff />} />
            <Route path="payroll" element={<Payroll />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route path="/my" element={<EmployeeLayout />}>
            <Route path="schedule" element={<MySchedule />} />
            <Route path="hours" element={<MyHours />} />
            <Route path="time-off" element={<MyTimeOff />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
