import { useState } from 'react';
import './App.css';
import { TodayView, CreateSchedule, VoiceSchedule, Settings, ActiveSessionModal } from './components';

// Must match user_id used in all API calls and POST /schedules
const USER_ID = '00000000-0000-0000-0000-000000000001';

const NAV = [
  { id: 'today',    label: 'Today' },
  { id: 'new',      label: '+ New' },
  { id: 'voice',    label: 'Voice' },
  { id: 'settings', label: 'Settings' },
];

export default function App() {
  const [tab, setTab] = useState('today');

  return (
    <div className="shell">
      <header className="header">
        <span className="logo">VocaFlow</span>
      </header>

      <main className="main">
        {tab === 'today'    && <TodayView userId={USER_ID} onAdd={() => setTab('new')} />}
        {tab === 'new'      && <CreateSchedule userId={USER_ID} onDone={() => setTab('today')} />}
        {tab === 'voice'    && <VoiceSchedule userId={USER_ID} onDone={() => setTab('today')} />}
        {tab === 'settings' && <Settings />}
      </main>

      <nav className="nav">
        {NAV.map(({ id, label }) => (
          <button
            key={id}
            className={`navBtn${tab === id ? ' navActive' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
            <span className="navDot" />
          </button>
        ))}
      </nav>

      <ActiveSessionModal userId={USER_ID} />
    </div>
  );
}
