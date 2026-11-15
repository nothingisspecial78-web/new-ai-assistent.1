import React, { useCallback, useEffect, useState } from 'react';
import { Check, Download, FileSpreadsheet, Plus, Search, Upload } from 'lucide-react';
import type { ImportPreviewResult } from '@ai-assistant/core';
import { AssistantWidget } from '@ai-assistant/widget';

interface Student {
  id: string;
  admissionNo: string;
  fullName: string;
  email: string;
  sectorCode: string;
  unionName: string;
  fundingOption: 'Student Fees' | 'Charity' | 'Government Grant' | 'Endowment';
  feeAmount: number;
  status: 'Paid' | 'Pending' | 'Waived';
}

interface Sector {
  id: string;
  code: string;
  name: string;
  unionName: string;
  annualBudget: number;
}

interface Fund {
  id: string;
  sourceName: string;
  fundingType: 'Student Fees' | 'Charity' | 'Government Grant' | 'Endowment';
  targetSector: string;
  amount: number;
  createdAt: string;
}

const TOKEN = 'demo-finance-token';
const API_BASE = '/api/demo/college-finance';

export function CollegeFinanceApp({ onSwitchApp }: { onSwitchApp: () => void }) {
  const [tab, setTab] = useState<'students' | 'sectors' | 'funds' | 'import'>('students');
  const [students, setStudents] = useState<Student[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');

  // Form states
  const [studentForm, setStudentForm] = useState({
    admissionNo: '',
    fullName: '',
    email: '',
    sectorCode: 'ENG',
    unionName: 'Tech Union',
    fundingOption: 'Student Fees' as Student['fundingOption'],
    feeAmount: '42000',
  });
  const [sectorForm, setSectorForm] = useState({
    code: '',
    name: '',
    unionName: '',
    annualBudget: '250000',
  });
  const [fundForm, setFundForm] = useState({
    sourceName: '',
    fundingType: 'Charity' as Fund['fundingType'],
    targetSector: 'All Sectors',
    amount: '100000',
  });
  const [formFeedback, setFormFeedback] = useState<string | null>(null);

  // Import page state
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const authHeaders = {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  };

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, secRes, fRes] = await Promise.all([
        fetch(`${API_BASE}/students`, { headers: { Authorization: `Bearer ${TOKEN}` } }),
        fetch(`${API_BASE}/sectors`, { headers: { Authorization: `Bearer ${TOKEN}` } }),
        fetch(`${API_BASE}/funds`, { headers: { Authorization: `Bearer ${TOKEN}` } }),
      ]);
      const [sJson, secJson, fJson] = await Promise.all([sRes.json(), secRes.json(), fRes.json()]);
      setStudents(sJson.students || []);
      setSectors(secJson.sectors || []);
      setFunds(fJson.funds || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);
    const res = await fetch(`${API_BASE}/students`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        ...studentForm,
        feeAmount: Number(studentForm.feeAmount),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFormFeedback(data.error || 'Could not add student.');
      return;
    }
    setStudentForm((prev) => ({ ...prev, admissionNo: '', fullName: '', email: '' }));
    setFormFeedback(`Added student ${data.student.fullName}.`);
    await refreshAll();
  };

  const handleMarkPaid = async (id: string) => {
    await fetch(`${API_BASE}/students/${encodeURIComponent(id)}/pay`, {
      method: 'POST',
      headers: authHeaders,
    });
    await refreshAll();
  };

  const handleAddSector = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);
    const res = await fetch(`${API_BASE}/sectors`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        ...sectorForm,
        annualBudget: Number(sectorForm.annualBudget),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFormFeedback(data.error || 'Could not create sector.');
      return;
    }
    setSectorForm({ code: '', name: '', unionName: '', annualBudget: '250000' });
    setFormFeedback(`Created sector ${data.sector.code}.`);
    await refreshAll();
  };

  const handleAddFund = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormFeedback(null);
    const res = await fetch(`${API_BASE}/funds`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        ...fundForm,
        amount: Number(fundForm.amount),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFormFeedback(data.error || 'Could not add fund.');
      return;
    }
    setFundForm((prev) => ({ ...prev, sourceName: '' }));
    setFormFeedback(`Added fund source "${data.fund.sourceName}".`);
    await refreshAll();
  };

  const handleUploadSpreadsheet = async (file: File) => {
    setImportError(null);
    setImportStatus(null);
    const formData = new FormData();
    formData.append('appId', 'college-finance');
    formData.append('file', file);

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'x-app-id': 'college-finance',
      },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      setImportError(data.error || 'Spreadsheet upload failed.');
      return;
    }
    setImportPreview(data);
  };

  const handleConfirmImport = async () => {
    if (!importPreview?.actionId || !importPreview.confirmationToken) return;
    const res = await fetch(`/api/actions/${encodeURIComponent(importPreview.actionId)}/confirm`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'x-app-id': 'college-finance',
      },
      body: JSON.stringify({
        appId: 'college-finance',
        confirmationToken: importPreview.confirmationToken,
        decision: 'confirm',
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setImportError(data.error || 'Confirmation failed.');
      return;
    }
    setImportStatus(data.summary || 'Import confirmed.');
    await refreshAll();
  };

  const handleUndoImport = async () => {
    if (!importPreview?.actionId) return;
    const res = await fetch(`/api/actions/${encodeURIComponent(importPreview.actionId)}/undo`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'x-app-id': 'college-finance',
      },
      body: JSON.stringify({ appId: 'college-finance' }),
    });
    const data = await res.json();
    if (res.ok) {
      setImportStatus(data.summary || 'Import undone.');
      await refreshAll();
    }
  };

  const downloadSampleMixedCsv = () => {
    const csv = [
      'Admission No,Full Name,Email,Sector Code,Union Name,Funding Option,Fee Amount',
      'CF-2026-301,Riya Sebastian,riya.s@campus.edu,ENG,Tech Union,Student Fees,42000',
      'CF-2026-302,Arjun Menon,arjun.m@campus.edu,SCI,Science Forum,Charity,36000',
      'CF-2026-303,Bad Email Row,not-an-email,COM,Commerce Guild,Student Fees,28000',
      'CF-2026-304,Bad Fund Row,valid.mail@campus.edu,ART,Humanities Collective,InvalidSource,24500',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample-students-mixed.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const filteredStudents = students.filter((s) => {
    if (sectorFilter && s.sectorCode !== sectorFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.fullName.toLowerCase().includes(q) ||
      s.admissionNo.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    );
  });

  const totalFees = students.reduce((sum, s) => sum + s.feeAmount, 0);
  const totalFunds = funds.reduce((sum, f) => sum + f.amount, 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Three-Zone Top Navigation Bar */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 sm:gap-8">
          <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            Campus Finance
          </span>

          <nav aria-label="College Finance sections" className="hidden md:flex items-center gap-6">
            {(['students', 'sectors', 'funds', 'import'] as const).map((item) => (
              <button
                key={item}
                type="button"
                data-aia-tab={item}
                onClick={() => {
                  setTab(item);
                  setFormFeedback(null);
                }}
                className={`text-sm font-medium capitalize whitespace-nowrap shrink-0 pb-1 border-b-2 transition-colors cursor-pointer ${
                  tab === item
                    ? 'border-blue-700 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                {item}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <a
              href="/embed-demo.html"
              className="hidden lg:inline text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap shrink-0"
            >
              Script Embed Demo
            </a>
            <button
              type="button"
              onClick={onSwitchApp}
              className="px-3 sm:px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span className="sm:hidden">Library App</span>
              <span className="hidden sm:inline">Switch to Library App</span>
            </button>
          </div>
        </div>
        <nav aria-label="College Finance mobile sections" className="flex md:hidden items-center gap-4 mt-2.5 pt-2 border-t border-slate-100 overflow-x-auto">
          {(['students', 'sectors', 'funds', 'import'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setTab(item);
                setFormFeedback(null);
              }}
              className={`text-xs font-medium capitalize whitespace-nowrap shrink-0 pb-1 border-b-2 transition-colors cursor-pointer ${
                tab === item
                  ? 'border-blue-700 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              {item}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Clean KPI Summary Row */}
        <section aria-label="Financial summary" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-medium text-slate-500">Enrolled Students</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {students.length}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-medium text-slate-500">Active Sectors</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {sectors.length}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-medium text-slate-500">Assessed Fees</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {totalFees.toLocaleString()}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="text-xs font-medium text-slate-500">Allocated Fund Pools</div>
            <div className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {totalFunds.toLocaleString()}
            </div>
          </div>
        </section>

        {formFeedback && (
          <div
            role="status"
            className="px-4 py-3 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-800"
          >
            {formFeedback}
          </div>
        )}

        {/* STUDENTS VIEW */}
        {tab === 'students' && (
          <section className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Student Fee Directory</h1>
                <p className="text-sm text-slate-500">
                  Manage student enrollments, union allocations, and funding selections.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    aria-label="Search students"
                    data-aia-control="search-students"
                    placeholder="Search name or admission no..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-700"
                  />
                </div>
                <select
                  aria-label="Filter by sector"
                  data-aia-control="sector-filter"
                  value={sectorFilter}
                  onChange={(e) => setSectorFilter(e.target.value)}
                  className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                >
                  <option value="">All Sectors</option>
                  {sectors.map((sec) => (
                    <option key={sec.id} value={sec.code}>
                      {sec.code} — {sec.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Admission No</th>
                      <th className="py-3 px-4">Full Name</th>
                      <th className="py-3 px-4">Sector / Union</th>
                      <th className="py-3 px-4">Funding Option</th>
                      <th className="py-3 px-4 text-right">Fee Amount</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="py-8 px-4 text-center text-slate-500">
                          Loading student ledger...
                        </td>
                      </tr>
                    ) : filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 px-4 text-center text-slate-500">
                          No students match the current filter.
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((stu) => (
                        <tr key={stu.id} data-aia-row={stu.id} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-4 font-mono text-xs tabular-nums text-slate-700">
                            {stu.admissionNo}
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-medium text-slate-900">{stu.fullName}</div>
                            <div className="text-xs text-slate-500">{stu.email}</div>
                          </td>
                          <td className="py-2.5 px-4 text-slate-700">
                            {stu.sectorCode} <span className="text-slate-400">·</span> {stu.unionName}
                          </td>
                          <td className="py-2.5 px-4 text-slate-700">{stu.fundingOption}</td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-900">
                            {stu.feeAmount.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`text-xs font-semibold ${
                                stu.status === 'Paid'
                                  ? 'text-green-700'
                                  : stu.status === 'Waived'
                                    ? 'text-blue-700'
                                    : 'text-amber-700'
                              }`}
                            >
                              {stu.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            {stu.status === 'Pending' ? (
                              <button
                                type="button"
                                data-aia-action="mark-paid"
                                data-aia-id={stu.id}
                                data-aia-name={stu.fullName}
                                data-aia-admission={stu.admissionNo}
                                onClick={() => handleMarkPaid(stu.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-100 cursor-pointer"
                              >
                                <Check size={12} />
                                Mark Paid
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <form
              onSubmit={handleAddStudent}
              className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
            >
              <h2 className="text-sm font-bold text-slate-900">Enroll Student</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  required
                  placeholder="Admission No (e.g. CF-2026-105)"
                  value={studentForm.admissionNo}
                  onChange={(e) => setStudentForm({ ...studentForm, admissionNo: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <input
                  required
                  placeholder="Full Name"
                  value={studentForm.fullName}
                  onChange={(e) => setStudentForm({ ...studentForm, fullName: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <input
                  required
                  type="email"
                  placeholder="Email Address"
                  value={studentForm.email}
                  onChange={(e) => setStudentForm({ ...studentForm, email: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <select
                  aria-label="Select Funding Option"
                  value={studentForm.fundingOption}
                  onChange={(e) =>
                    setStudentForm({
                      ...studentForm,
                      fundingOption: e.target.value as Student['fundingOption'],
                    })
                  }
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="Student Fees">Student Fees</option>
                  <option value="Charity">Charity</option>
                  <option value="Government Grant">Government Grant</option>
                  <option value="Endowment">Endowment</option>
                </select>
                <select
                  aria-label="Select Sector Code"
                  value={studentForm.sectorCode}
                  onChange={(e) => setStudentForm({ ...studentForm, sectorCode: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {sectors.map((s) => (
                    <option key={s.id} value={s.code}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </select>
                <input
                  required
                  placeholder="Union Name"
                  value={studentForm.unionName}
                  onChange={(e) => setStudentForm({ ...studentForm, unionName: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <input
                  required
                  type="number"
                  min={0}
                  placeholder="Fee Amount"
                  value={studentForm.feeAmount}
                  onChange={(e) => setStudentForm({ ...studentForm, feeAmount: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
                >
                  <Plus size={15} />
                  Add Student
                </button>
              </div>
            </form>
          </section>
        )}

        {/* SECTORS VIEW */}
        {tab === 'sectors' && (
          <section className="space-y-6">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Academic Sectors & Unions</h1>
              <p className="text-sm text-slate-500">
                Create department sectors and track annual budget ceilings.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Sector Name</th>
                    <th className="py-3 px-4">Associated Union</th>
                    <th className="py-3 px-4 text-right">Annual Budget</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {sectors.map((sec) => (
                    <tr key={sec.id} data-aia-row={sec.id}>
                      <td className="py-3 px-4 font-mono font-semibold text-slate-900">{sec.code}</td>
                      <td className="py-3 px-4 text-slate-900">{sec.name}</td>
                      <td className="py-3 px-4 text-slate-600">{sec.unionName}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                        {sec.annualBudget.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form
              onSubmit={handleAddSector}
              className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
            >
              <h2 className="text-sm font-bold text-slate-900">Create Sector</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  required
                  placeholder="Sector Code (e.g. BIO)"
                  value={sectorForm.code}
                  onChange={(e) => setSectorForm({ ...sectorForm, code: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <input
                  required
                  placeholder="Sector Name"
                  value={sectorForm.name}
                  onChange={(e) => setSectorForm({ ...sectorForm, name: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <input
                  required
                  placeholder="Union Name"
                  value={sectorForm.unionName}
                  onChange={(e) => setSectorForm({ ...sectorForm, unionName: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <div className="flex gap-2">
                  <input
                    required
                    type="number"
                    min={0}
                    placeholder="Budget"
                    value={sectorForm.annualBudget}
                    onChange={(e) => setSectorForm({ ...sectorForm, annualBudget: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Create Sector
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}

        {/* FUNDS VIEW */}
        {tab === 'funds' && (
          <section className="space-y-6">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Funding Sources</h1>
              <p className="text-sm text-slate-500">
                Select and register Student Fees, Charity, Government Grant, and Endowment pools.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Source Name</th>
                    <th className="py-3 px-4">Funding Type</th>
                    <th className="py-3 px-4">Target Sector</th>
                    <th className="py-3 px-4 text-right">Allocation Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {funds.map((f) => (
                    <tr key={f.id} data-aia-row={f.id}>
                      <td className="py-3 px-4 font-medium text-slate-900">{f.sourceName}</td>
                      <td className="py-3 px-4 text-slate-700">{f.fundingType}</td>
                      <td className="py-3 px-4 text-slate-600">{f.targetSector}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                        {f.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form
              onSubmit={handleAddFund}
              className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
            >
              <h2 className="text-sm font-bold text-slate-900">Add Fund Source</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  required
                  placeholder="Donor / Fund Source Name"
                  value={fundForm.sourceName}
                  onChange={(e) => setFundForm({ ...fundForm, sourceName: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <select
                  aria-label="Funding Type"
                  value={fundForm.fundingType}
                  onChange={(e) =>
                    setFundForm({ ...fundForm, fundingType: e.target.value as Fund['fundingType'] })
                  }
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  <option value="Student Fees">Student Fees</option>
                  <option value="Charity">Charity</option>
                  <option value="Government Grant">Government Grant</option>
                  <option value="Endowment">Endowment</option>
                </select>
                <input
                  required
                  placeholder="Target Sector (or All Sectors)"
                  value={fundForm.targetSector}
                  onChange={(e) => setFundForm({ ...fundForm, targetSector: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <div className="flex gap-2">
                  <input
                    required
                    type="number"
                    min={1}
                    placeholder="Amount"
                    value={fundForm.amount}
                    onChange={(e) => setFundForm({ ...fundForm, amount: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Add Fund Source
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}

        {/* IMPORT VIEW */}
        {tab === 'import' && (
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Import Students from Excel / CSV</h1>
                <p className="text-sm text-slate-500">
                  Upload `.xlsx` or `.csv` files (up to 5 MB / 5,000 rows), preview row validation, and confirm import.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={`${API_BASE}/template.xlsx`}
                  download="students-template.xlsx"
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 whitespace-nowrap shrink-0"
                >
                  <Download size={14} />
                  Download Excel Template
                </a>
                <button
                  type="button"
                  onClick={downloadSampleMixedCsv}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <FileSpreadsheet size={14} />
                  Sample Mixed CSV
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-6">
              <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-slate-300 rounded-lg p-8 cursor-pointer hover:border-blue-700 transition-colors">
                <Upload size={24} className="text-slate-500" />
                <span className="text-sm font-semibold text-slate-800">
                  Select an Excel (.xlsx) or CSV (.csv) student sheet to preview
                </span>
                <span className="text-xs text-slate-500">
                  Or drag and drop it directly into the AI Assistant side panel
                </span>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadSpreadsheet(f);
                    e.target.value = '';
                  }}
                />
              </label>

              {importError && (
                <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  {importError}
                </div>
              )}

              {importPreview && (
                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold text-slate-900">
                      Preview: {importPreview.fileName}
                    </div>
                    <div className="text-xs font-mono tabular-nums text-slate-600">
                      {importPreview.validCount} valid · {importPreview.invalidCount} invalid · {importPreview.totalRows} total
                    </div>
                  </div>

                  {importPreview.errors.length > 0 && (
                    <div className="border border-red-200 rounded-lg overflow-hidden">
                      <div className="bg-red-50 px-4 py-2 text-xs font-semibold text-red-800">
                        Validation Errors ({importPreview.errors.length})
                      </div>
                      <ul className="divide-y divide-red-100 text-xs p-3 space-y-1.5">
                        {importPreview.errors.map((err) => (
                          <li key={err.rowNumber} className="text-red-700">
                            <span className="font-mono font-semibold">Row {err.rowNumber}:</span>{' '}
                            {err.reasons.join('; ')}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {importStatus && (
                    <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm font-medium text-green-800">
                      {importStatus}
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    {importPreview.validCount > 0 && !importStatus && (
                      <button
                        type="button"
                        onClick={handleConfirmImport}
                        className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
                      >
                        Confirm Import ({importPreview.validCount} Students)
                      </button>
                    )}
                    {importStatus && (
                      <button
                        type="button"
                        onClick={handleUndoImport}
                        className="px-4 py-2 text-sm font-semibold text-slate-800 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 cursor-pointer"
                      >
                        Undo Import
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <AssistantWidget
        appId="college-finance"
        apiUrl=""
        getAuthToken={() => TOKEN}
        title="College Finance Assistant"
        suggestions={[
          'How do I select a funding option?',
          'How do I import students?',
          'How do I create a sector?',
          'List enrolled students in ENG sector',
        ]}
        theme={{
          primaryColor: '#0f172a',
          accentColor: '#1d4ed8',
          position: 'right',
        }}
        onActionCompleted={() => {
          void refreshAll();
        }}
      />
    </div>
  );
}
