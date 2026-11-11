import {
  Navigate,
  Route,
  Routes,
} from "react-router";

import PublicLayout from "./layouts/PublicLayout";
import RoleLayout from "./layouts/RoleLayout";

/* Public pages */
import Splash from "./pages/public/Splash";
import Login from "./pages/public/Login";
import Signup from "./pages/public/Signup";

/* Resident pages */
import ResidentDashboard from "./pages/resident/ResidentDashboard";
import ReportWaste from "./pages/resident/ReportWaste";
import QRScanner from "./pages/resident/QRScanner";
import SiteMap from "./pages/resident/SiteMap";
import SiteDetails from "./pages/resident/SiteDetails";
import CreateReport from "./pages/resident/CreateReport";
import Analyzing from "./pages/resident/Analyzing";
import ReviewSubmit from "./pages/resident/ReviewSubmit";
import Submitted from "./pages/resident/Submitted";
import ResidentReports from "./pages/resident/ResidentReports";
import ResidentReviewReports from "./pages/resident/ResidentReviewReports";
import ResidentNotification from "./pages/resident/ResidentNotification";
import Capture from "./pages/resident/Capture";

/* Barangay staff pages */
import AdminDashboard from "./pages/admin/AdminDashboard";
import ManageResidents from "./pages/admin/ManageResidents";
import ManageCollectors from "./pages/admin/ManageCollectors";
import AdminReviewReport from "./pages/admin/AdminReviewReport";
import ManageSchedules from "./pages/admin/ManageSchedules";
import ManageWasteStatus from "./pages/admin/ManageWasteStatus";
import DisposalSites from "./pages/admin/DisposalSites";
import UploadedImages from "./pages/admin/UploadedImages";
import Alerts from "./pages/admin/Alerts";
import ManageAccount from "./pages/admin/ManageAccount";
import WasteStatusDetails from "./pages/admin/WasteStatusDetails";
import RegisterDisposalSite from "./pages/admin/RegisterDisposalSite";
import EditCollectorAccount from "./pages/admin/EditCollectorAccount";
import CollectorsAccount from "./pages/admin/CollectorsAccount";

/* Waste collector pages */
import CollectorDashboard from "./pages/collectors/CollectorDashboard";
import CollectionDetails from "./pages/collectors/CollectionDetails";
import CollectionHistory from "./pages/collectors/CollectionHistory";
import CollectorRoute from "./pages/collectors/Route";
import WasteCollection from "./pages/collectors/WasteCollection";
import SubmitCollection from "./pages/collectors/SubmitCollection";
import After_Collection_Capture from "./pages/collectors/After_Collection_Capture";
/* Shared pages */
import Calendar from "./pages/shared/Calendar";
import CalendarList from "./pages/shared/CalendarList";
import ScheduleDetails from "./pages/shared/ScheduleDetails";
import Profile from "./pages/shared/Profile";

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to="/splash" replace />}
      />

      {/* No navigation */}
      <Route element={<PublicLayout />}>
        <Route path="/splash" element={<Splash />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
      </Route>

      {/* Resident routes with MobileBottomNav */}
      <Route
        element={
          <RoleLayout allowedRoles={["resident"]} />
        }
      >
        <Route
          path="/resident/dashboard"
          element={<ResidentDashboard />}
        />

        <Route
          path="/resident/report-waste"
          element={<ReportWaste />}
        />

        <Route
          path="/resident/report-waste/qr"
          element={<QRScanner />}
        />

        <Route
          path="/resident/report-waste/map"
          element={<SiteMap />}
        />

        <Route
          path="/resident/report-waste/site"
          element={<SiteDetails />}
        />

        <Route
          path="/resident/report-waste/capture"
          element={<Capture />}
        />

        <Route
          path="/resident/report-waste/create"
          element={<CreateReport />}
        />

        <Route
          path="/resident/report-waste/analyzing"
          element={<Analyzing />}
        />

        <Route
          path="/resident/report-waste/review"
          element={<ReviewSubmit />}
        />

        <Route
          path="/resident/report-waste/submitted"
          element={<Submitted />}
        />

        <Route
          path="/resident/reports"
          element={<ResidentReports />}
        />

        <Route
          path="/resident/calendar"
          element={<Calendar role="resident" />}
        />

        <Route
          path="/resident/calendar/list/:date"
          element={<CalendarList role="resident" />}
        />

        <Route
          path="/resident/schedule-details/:scheduleId"
          element={<ScheduleDetails role="resident" />}
        />

        <Route
          path="/resident/reports/review"
          element={<ResidentReviewReports />}
        />

        <Route
          path="/resident/notifications"
          element={<ResidentNotification />}
        />

        <Route 
          path="/resident/profile" 
          element={<Profile />} 
          />
      </Route>

      {/* Barangay staff routes with DesktopSidebar */}
      <Route
        element={
          <RoleLayout allowedRoles={["admin"]} />
        }
      >
        <Route
          path="/admin/dashboard"
          element={<AdminDashboard />}
        />


        {/* keeps the old URL working if anything still links to it */}
        <Route
          path="/admin/AdminDashboard"
          element={<Navigate to="/admin/dashboard" replace />}
        />

        <Route
          path="/admin/residents"
          element={<ManageResidents />}
        />

        <Route
          path="/admin/collectors"
          element={<ManageCollectors />}
        />

        <Route
          path="/admin/collectors/new"
          element={<CollectorsAccount />}
        />

        <Route
          path="/admin/collectors/:collectorId"
          element={<EditCollectorAccount />}
        />

        <Route
          path="/admin/reports"
          element={<AdminReviewReport />}
        />

        <Route
          path="/admin/schedules"
          element={<ManageSchedules />}
        />


        <Route
          path="/admin/waste-status"
          element={<ManageWasteStatus />}
        />

        <Route path="/admin/disposal-sites" 
        element={<DisposalSites />} />

        <Route path="/admin/uploaded-images" 
        element={<UploadedImages />} />

        <Route path="/admin/alerts" 
        element={<Alerts />} />

        <Route path="/admin/account" 
        element={<ManageAccount />} />

        <Route path="/admin/waste-status/:siteId" 
        element={<WasteStatusDetails />} />

        <Route path="/admin/disposal-sites/register" 
        element={<RegisterDisposalSite />} />

      </Route>

      {/* Waste collector routes with MobileBottomNav */}
      <Route
        element={
          <RoleLayout allowedRoles={["collector"]} />
        }
      >
        <Route
          path="/collector/dashboard"
          element={<CollectorDashboard />}
        />

        <Route
          path="/collector/calendar"
          element={<Calendar role="collector" />}
        />

        <Route
          path="/collector/calendar/list/:date"
          element={<CalendarList role="collector" />}
        />

        <Route
          path="/collector/schedule-details/:scheduleId"
          element={<ScheduleDetails role="collector" />}
        />

        <Route
          path="/collector/history"
          element={<CollectionHistory />}
        />

        <Route 
          path="/collector/route" 
          element={<CollectorRoute />} 
        />

        <Route
          path="/collector/waste-collection"
          element={<WasteCollection />}
        />

        <Route
          path="/collector/submit-collection"
          element={<SubmitCollection />}
        />

        <Route
          path="/collector/collection-details"
          element={<CollectionDetails />}
        />

        <Route
          path="/collector/capture"
          element={<After_Collection_Capture />}
        />
      </Route>

      <Route
        path="*"
        element={<Navigate to="/login" replace />}
      />
      <Route 
        path="/collector/profile" 
        element={<Profile />} 
      />
    </Routes>
  );
}