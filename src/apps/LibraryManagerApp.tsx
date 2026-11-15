import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Plus, RotateCcw } from 'lucide-react';
import { AssistantWidget } from '@ai-assistant/widget';

interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string;
  shelf: string;
  copies: number;
  available: number;
}

interface Loan {
  id: string;
  bookId: string;
  bookTitle: string;
  memberName: string;
  dueDate: string;
  returned: boolean;
}

const TOKEN = 'demo-library-token';
const API_BASE = '/api/demo/second-demo';

export function LibraryManagerApp({ onSwitchApp }: { onSwitchApp: () => void }) {
  const [tab, setTab] = useState<'catalog' | 'loans'>('catalog');
  const [books, setBooks] = useState<Book[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [form, setForm] = useState({
    title: '',
    author: '',
    isbn: '',
    shelf: 'CS-08',
    copies: '3',
  });
  const [borrower, setBorrower] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [bRes, lRes] = await Promise.all([
      fetch(`${API_BASE}/books`, { headers: { Authorization: `Bearer ${TOKEN}` } }),
      fetch(`${API_BASE}/loans`, { headers: { Authorization: `Bearer ${TOKEN}` } }),
    ]);
    const [bJson, lJson] = await Promise.all([bRes.json(), lRes.json()]);
    setBooks(bJson.books || []);
    setLoans(lJson.loans || []);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAddBook = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await fetch(`${API_BASE}/books`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...form, copies: Number(form.copies) }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error || 'Could not add book.');
      return;
    }
    setForm({ title: '', author: '', isbn: '', shelf: 'CS-08', copies: '3' });
    setFeedback(`Added "${data.record.title}" to catalog.`);
    await refresh();
  };

  const handleCheckout = async (bookId: string) => {
    setFeedback(null);
    const res = await fetch(`${API_BASE}/loans`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ bookId, memberName: borrower || 'Campus Student' }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFeedback(data.error || 'Checkout failed.');
      return;
    }
    setFeedback(`Checked out "${data.record.bookTitle}".`);
    await refresh();
  };

  const handleReturn = async (loanId: string) => {
    await fetch(`${API_BASE}/loans/${encodeURIComponent(loanId)}/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    await refresh();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 sm:gap-8">
          <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
            Campus Library
          </span>

          <nav aria-label="Library sections" className="flex items-center gap-4 sm:gap-6">
            <button
              type="button"
              data-aia-tab="catalog"
              onClick={() => setTab('catalog')}
              className={`text-sm font-medium whitespace-nowrap shrink-0 pb-1 border-b-2 cursor-pointer ${
                tab === 'catalog'
                  ? 'border-blue-700 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Catalog
            </button>
            <button
              type="button"
              data-aia-tab="loans"
              onClick={() => setTab('loans')}
              className={`text-sm font-medium whitespace-nowrap shrink-0 pb-1 border-b-2 cursor-pointer ${
                tab === 'loans'
                  ? 'border-blue-700 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              Loans
            </button>
          </nav>

          <button
            type="button"
            onClick={onSwitchApp}
            className="px-3 sm:px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span className="sm:hidden">Finance App</span>
            <span className="hidden sm:inline">Switch to College Finance</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {feedback && (
          <div className="px-4 py-3 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-800">
            {feedback}
          </div>
        )}

        {tab === 'catalog' ? (
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Library Catalog</h1>
                <p className="text-sm text-slate-500">
                  Second independent web app proving the widget switches cleanly via appId="second-demo".
                </p>
              </div>
              <input
                placeholder="Borrower name for checkout..."
                value={borrower}
                onChange={(e) => setBorrower(e.target.value)}
                className="px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
              />
            </div>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Title & Author</th>
                    <th className="py-3 px-4">ISBN</th>
                    <th className="py-3 px-4">Shelf</th>
                    <th className="py-3 px-4 text-right">Available</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {books.map((book) => (
                    <tr key={book.id} data-aia-row={book.id}>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{book.title}</div>
                        <div className="text-xs text-slate-500">{book.author}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-600">
                        {book.isbn}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-700">{book.shelf}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-900">
                        {book.available} / {book.copies}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          data-aia-action="checkout-book"
                          data-aia-id={book.id}
                          disabled={book.available <= 0}
                          onClick={() => handleCheckout(book.id)}
                          className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                        >
                          <BookOpen size={12} />
                          Checkout
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form
              onSubmit={handleAddBook}
              className="bg-white border border-slate-200 rounded-lg p-5 space-y-4"
            >
              <h2 className="text-sm font-bold text-slate-900">Add Book to Catalog</h2>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <input
                  required
                  placeholder="Book Title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <input
                  required
                  placeholder="Author"
                  value={form.author}
                  onChange={(e) => setForm({ ...form, author: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
                <input
                  required
                  placeholder="ISBN-13"
                  value={form.isbn}
                  onChange={(e) => setForm({ ...form, isbn: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                />
                <input
                  required
                  placeholder="Shelf (e.g. CS-08)"
                  value={form.shelf}
                  onChange={(e) => setForm({ ...form, shelf: e.target.value })}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                />
                <div className="flex gap-2">
                  <input
                    required
                    type="number"
                    min={1}
                    value={form.copies}
                    onChange={(e) => setForm({ ...form, copies: e.target.value })}
                    className="w-20 px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
                  />
                  <button
                    type="submit"
                    className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg hover:bg-blue-800 cursor-pointer"
                  >
                    <Plus size={14} />
                    Add Book
                  </button>
                </div>
              </div>
            </form>
          </section>
        ) : (
          <section className="space-y-4">
            <h1 className="text-xl font-bold text-slate-900">Active Loans</h1>
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Book Title</th>
                    <th className="py-3 px-4">Borrower</th>
                    <th className="py-3 px-4">Due Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loans.map((loan) => (
                    <tr key={loan.id} data-aia-row={loan.id}>
                      <td className="py-3 px-4 font-medium text-slate-900">{loan.bookTitle}</td>
                      <td className="py-3 px-4 text-slate-700">{loan.memberName}</td>
                      <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-600">
                        {loan.dueDate}
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold">
                        {loan.returned ? (
                          <span className="text-green-700">Returned</span>
                        ) : (
                          <span className="text-amber-700">Checked Out</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {!loan.returned && (
                          <button
                            type="button"
                            data-aia-action="return-loan"
                            data-aia-id={loan.id}
                            onClick={() => handleReturn(loan.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-100 cursor-pointer"
                          >
                            <RotateCcw size={12} />
                            Mark Returned
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      <AssistantWidget
        appId="second-demo"
        apiUrl=""
        getAuthToken={() => TOKEN}
        title="Campus Library Assistant"
        suggestions={[
          'How long can undergraduate students borrow a book?',
          'How do I add a new book to the library catalog?',
          'List all books in the catalog',
        ]}
        theme={{
          primaryColor: '#1e293b',
          accentColor: '#1d4ed8',
          position: 'right',
        }}
        onActionCompleted={() => {
          void refresh();
        }}
      />
    </div>
  );
}
