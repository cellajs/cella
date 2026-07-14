import { describe, expect, it } from 'vitest'
import { certVerdict, dnsAnswersSatisfy } from '../../resources/dns-cert-gates'

describe('dnsAnswersSatisfy', () => {
  it('passes only when every resolver answers with the expected IP', () => {
    expect(dnsAnswersSatisfy([['1.2.3.4'], ['1.2.3.4']], '1.2.3.4')).toBe(true)
    expect(dnsAnswersSatisfy([['1.2.3.4', '5.6.7.8'], ['1.2.3.4']], '1.2.3.4')).toBe(true)
  })

  it('fails while any resolver still misses the record (partial propagation)', () => {
    expect(dnsAnswersSatisfy([['1.2.3.4'], []], '1.2.3.4')).toBe(false)
    expect(dnsAnswersSatisfy([[], []], '1.2.3.4')).toBe(false)
    expect(dnsAnswersSatisfy([], '1.2.3.4')).toBe(false)
  })

  it('fails on a stale answer pointing elsewhere', () => {
    expect(dnsAnswersSatisfy([['9.9.9.9'], ['1.2.3.4']], '1.2.3.4')).toBe(false)
  })
})

describe('certVerdict', () => {
  it('proceeds on ready, waits on pending', () => {
    expect(certVerdict('ready')).toBe('ready')
    expect(certVerdict('pending')).toBe('wait')
  })

  it('fails the deploy at the cert with the ACME detail on error', () => {
    expect(() => certVerdict('error', 'acme: NXDOMAIN for api.example.com')).toThrow(/NXDOMAIN for api\.example\.com/)
    expect(() => certVerdict('error')).toThrow(/issuance failed/)
  })
})
