import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ToolDefinition } from '../tools/types.ts';
import { inferDeterministicToolCall, shouldUseAgentLoop } from './intentParser.ts';

function fakeTools(names: string[]): Map<string, ToolDefinition> {
  const map = new Map<string, ToolDefinition>();
  for (const name of names) {
    map.set(name, {
      name,
      description: name,
      risk: 'read',
      inputSchema: z.object({}),
      jsonParameters: {},
      summarize: () => name,
      async execute() {
        return { ok: true, summary: name, data: {} };
      },
    });
  }
  return map;
}

describe('Intent Parser & Agent Routing', () => {
  const financeTools = fakeTools([
    'addStudent',
    'createSector',
    'addFund',
    'markStudentPaid',
    'unmarkStudentPaid',
    'listStudents',
    'getFinanceOverview',
    'controlAppUi',
    'importStudents',
  ]);

  const libraryTools = fakeTools([
    'listBooks',
    'listLoans',
    'addBook',
    'borrowBook',
    'returnBook',
    'controlAppUi',
  ]);

  it('routes action commands to agent loop while keeping conceptual questions in RAG Q&A', () => {
    expect(shouldUseAgentLoop('Add student Kiran Verma', 5)).toBe(true);
    expect(shouldUseAgentLoop('Create sector BIO Biotechnology', 5)).toBe(true);
    expect(shouldUseAgentLoop('Open sectors tab', 5)).toBe(true);
    expect(shouldUseAgentLoop('How do I create a sector?', 5)).toBe(false);
    expect(shouldUseAgentLoop('What columns are required in the student import template?', 5)).toBe(false);
    expect(shouldUseAgentLoop('Can I undo a student import after confirming?', 5)).toBe(false);
  });

  it('parses addStudent commands with partial or full details', () => {
    expect(
      inferDeterministicToolCall(
        'Add student Kiran Verma, email kiran.v@campus.edu, sector ENG, fee 45000',
        financeTools,
        []
      )
    ).toEqual({
      name: 'addStudent',
      args: {
        fullName: 'Kiran Verma',
        email: 'kiran.v@campus.edu',
        sectorCode: 'ENG',
        feeAmount: 45000,
      },
    });

    expect(
      inferDeterministicToolCall('Enroll student CF-2026-109 Priya Nair', financeTools, [])
    ).toEqual({
      name: 'addStudent',
      args: {
        fullName: 'Priya Nair',
        admissionNo: 'CF-2026-109',
      },
    });
  });

  it('parses createSector, addFund, unmarkStudentPaid, and controlAppUi commands', () => {
    expect(
      inferDeterministicToolCall(
        'Create sector BIO Biotechnology Bio Union budget 300000',
        financeTools,
        []
      )
    ).toEqual({
      name: 'createSector',
      args: {
        code: 'BIO',
        name: 'Biotechnology',
        unionName: 'Bio Union',
        annualBudget: 300000,
      },
    });

    expect(
      inferDeterministicToolCall(
        'Add charity fund Alumni Support 75000 for BIO',
        financeTools,
        []
      )
    ).toEqual({
      name: 'addFund',
      args: {
        sourceName: 'Alumni Support',
        fundingType: 'Charity',
        targetSector: 'BIO',
        amount: 75000,
      },
    });

    expect(
      inferDeterministicToolCall('Mark Aarav Krishnan as pending', financeTools, [])
    ).toEqual({
      name: 'unmarkStudentPaid',
      args: { studentName: 'Aarav Krishnan' },
    });

    expect(inferDeterministicToolCall('Open sectors tab', financeTools, [])).toEqual({
      name: 'controlAppUi',
      args: { tab: 'sectors' },
    });

    expect(inferDeterministicToolCall('Filter students by ENG', financeTools, [])).toEqual({
      name: 'controlAppUi',
      args: { tab: 'students', sectorFilter: 'ENG' },
    });
  });

  it('parses Campus Library addBook, borrowBook, and returnBook commands', () => {
    expect(
      inferDeterministicToolCall(
        'Add book System Design by Alex Xu shelf CS-09 copies 4',
        libraryTools,
        []
      )
    ).toEqual({
      name: 'addBook',
      args: {
        title: 'System Design',
        author: 'Alex Xu',
        shelf: 'CS-09',
        copies: 4,
      },
    });

    expect(
      inferDeterministicToolCall(
        'Borrow Clean Architecture for Meera Nair',
        libraryTools,
        []
      )
    ).toEqual({
      name: 'borrowBook',
      args: {
        bookTitle: 'Clean Architecture',
        memberName: 'Meera Nair',
      },
    });

    expect(
      inferDeterministicToolCall(
        'Return book Designing Data-Intensive Applications',
        libraryTools,
        []
      )
    ).toEqual({
      name: 'returnBook',
      args: {
        bookTitle: 'Designing Data-Intensive Applications',
      },
    });
  });
});
