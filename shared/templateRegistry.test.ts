import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerTemplate,
  getTemplate,
  hasTemplate,
  checkTemplates,
  getAllTemplateNames,
  clearRegistry,
} from './templateRegistry.js';

// Minimal stub that satisfies TagFunction shape
const stubComponent = (() => () => ({})) as any;
const stubComponent2 = (() => () => ({})) as any;

describe('templateRegistry', () => {
  beforeEach(() => {
    clearRegistry();
  });

  it('registers and retrieves a template', () => {
    registerTemplate('page:article', stubComponent);
    expect(getTemplate('page:article')).toBe(stubComponent);
  });

  it('returns undefined for unregistered template', () => {
    expect(getTemplate('page:missing')).toBeUndefined();
  });

  it('hasTemplate returns correct boolean', () => {
    expect(hasTemplate('page:article')).toBe(false);
    registerTemplate('page:article', stubComponent);
    expect(hasTemplate('page:article')).toBe(true);
  });

  it('checkTemplates returns missing names', () => {
    registerTemplate('a', stubComponent);
    registerTemplate('b', stubComponent2);

    const missing = checkTemplates(['a', 'b', 'c', 'd']);
    expect(missing).toEqual(['c', 'd']);
  });

  it('checkTemplates returns empty array when all present', () => {
    registerTemplate('x', stubComponent);
    expect(checkTemplates(['x'])).toEqual([]);
  });

  it('getAllTemplateNames lists registered keys', () => {
    registerTemplate('a', stubComponent);
    registerTemplate('b', stubComponent2);
    expect(getAllTemplateNames().sort()).toEqual(['a', 'b']);
  });

  it('clearRegistry removes all entries', () => {
    registerTemplate('a', stubComponent);
    clearRegistry();
    expect(hasTemplate('a')).toBe(false);
    expect(getAllTemplateNames()).toEqual([]);
  });

  it('overwrites existing registration', () => {
    registerTemplate('a', stubComponent);
    registerTemplate('a', stubComponent2);
    expect(getTemplate('a')).toBe(stubComponent2);
  });
});
