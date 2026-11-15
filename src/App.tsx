import { useState } from 'react';
import { CollegeFinanceApp } from './apps/CollegeFinanceApp';
import { LibraryManagerApp } from './apps/LibraryManagerApp';

export default function App() {
  const initialApp =
    typeof window !== 'undefined' && window.location.pathname.includes('library')
      ? 'second-demo'
      : 'college-finance';

  const [activeApp, setActiveApp] = useState<'college-finance' | 'second-demo'>(initialApp);

  if (activeApp === 'second-demo') {
    return <LibraryManagerApp onSwitchApp={() => setActiveApp('college-finance')} />;
  }

  return <CollegeFinanceApp onSwitchApp={() => setActiveApp('second-demo')} />;
}
