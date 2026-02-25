import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import AppLayout from "@/components/layout/AppLayout";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CapsulesPage from "@/pages/CapsulesPage";
import CapsuleDetailPage from "@/pages/CapsuleDetailPage";
import GraphPage from "@/pages/GraphPage";
import TimelinePage from "@/pages/TimelinePage";
import ResearchPage from "@/pages/ResearchPage";
import FeedbackPage from "@/pages/FeedbackPage";
import InboxPage from "@/pages/InboxPage";
import SettingsPage from "@/pages/SettingsPage";
import EntityDetailPage from "@/pages/EntityDetailPage";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/inbox" replace />} />
            <Route path="/capsules" element={<CapsulesPage />} />
            <Route path="/capsules/:id" element={<CapsuleDetailPage />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/graph" element={<GraphPage />} />
            <Route path="/research" element={<ResearchPage />} />
            <Route path="/timeline" element={<TimelinePage />} />
            <Route path="/entities/:type/:name" element={<EntityDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
