import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardTitle } from '../components/Card';
import { Button } from '../components/Button';
import {
  getInsuranceProfile,
  saveInsuranceProfile,
  evaluateInsuranceEligibility,
  getGovernmentInsurancePolicies
} from '../utils/api';
import { useToast } from '../components/Toast';

const DEFAULT_FORM = {
  hasExistingInsurance: false,
  currentInsurersText: '',
  currentPolicyNumber: '',
  insurancePlanType: 'none',
  coverageAmount: '',
  coverageNotes: '',

  age: '',
  gender: '',
  annualIncome: '',
  occupationType: 'other',
  state: '',
  city: '',
  dependentsCount: '0',

  isBpl: false,
  hasRationCard: false,
  isPregnant: false,
  hasDisability: false,
  chronicConditions: ''
};

function insurersToText(insurers) {
  if (!Array.isArray(insurers) || insurers.length === 0) return '';
  return insurers.join(', ');
}

function toNullableNumber(value) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : null;
}

function formFromProfile(profile = {}) {
  return {
    hasExistingInsurance: Boolean(profile.hasExistingInsurance),
    currentInsurersText: insurersToText(profile.currentInsurers),
    currentPolicyNumber: profile.currentPolicyNumber || '',
    insurancePlanType: profile.insurancePlanType || 'none',
    coverageAmount: profile.coverageAmount == null ? '' : String(profile.coverageAmount),
    coverageNotes: profile.coverageNotes || '',

    age: profile.age == null ? '' : String(profile.age),
    gender: profile.gender || '',
    annualIncome: profile.annualIncome == null ? '' : String(profile.annualIncome),
    occupationType: profile.occupationType || 'other',
    state: profile.state || '',
    city: profile.city || '',
    dependentsCount: profile.dependentsCount == null ? '0' : String(profile.dependentsCount),

    isBpl: Boolean(profile.isBpl),
    hasRationCard: Boolean(profile.hasRationCard),
    isPregnant: Boolean(profile.isPregnant),
    hasDisability: Boolean(profile.hasDisability),
    chronicConditions: profile.chronicConditions || ''
  };
}

function buildPayload(form) {
  const insurerList = String(form.currentInsurersText || '')
    .split(/[,\n]/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 8);

  return {
    hasExistingInsurance: Boolean(form.hasExistingInsurance),
    currentInsurers: insurerList,
    currentPolicyNumber: String(form.currentPolicyNumber || '').trim(),
    insurancePlanType: String(form.insurancePlanType || 'none'),
    coverageAmount: toNullableNumber(form.coverageAmount),
    coverageNotes: String(form.coverageNotes || '').trim(),

    age: toNullableNumber(form.age),
    gender: String(form.gender || '').toLowerCase(),
    annualIncome: toNullableNumber(form.annualIncome),
    occupationType: String(form.occupationType || 'other').toLowerCase(),
    state: String(form.state || '').trim(),
    city: String(form.city || '').trim(),
    dependentsCount: toNullableNumber(form.dependentsCount),

    isBpl: Boolean(form.isBpl),
    hasRationCard: Boolean(form.hasRationCard),
    isPregnant: Boolean(form.isPregnant),
    hasDisability: Boolean(form.hasDisability),
    chronicConditions: String(form.chronicConditions || '').trim()
  };
}

const InsuranceSupport = () => {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [recommendations, setRecommendations] = useState(null);
  const [policyCatalog, setPolicyCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const { addToast } = useToast();

  const eligiblePolicies = recommendations?.eligiblePolicies || [];
  const guidance = recommendations?.guidance || [];
  const hasExistingInsurance = useMemo(() => {
    if (!form.hasExistingInsurance) return false;
    return Boolean(String(form.currentInsurersText || '').trim());
  }, [form.hasExistingInsurance, form.currentInsurersText]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const [profileRes, catalogRes] = await Promise.all([
          getInsuranceProfile(),
          getGovernmentInsurancePolicies()
        ]);
        setForm(formFromProfile(profileRes?.profile || {}));
        setRecommendations(profileRes?.recommendations || null);
        setPolicyCatalog(Array.isArray(catalogRes?.policies) ? catalogRes.policies : []);
      } catch (err) {
        const msg = err.message || 'Failed to load insurance support data';
        setError(msg);
        addToast({ title: 'Load failed', description: msg, variant: 'error' });
      } finally {
        setLoading(false);
      }
    })();
  }, [addToast]);

  const onChange = (key) => (e) => {
    const value = e?.target?.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const onEvaluate = async () => {
    setError('');
    setMessage('');
    setEvaluating(true);
    try {
      const payload = buildPayload(form);
      const result = await evaluateInsuranceEligibility(payload);
      setRecommendations(result);
      const count = Number(result?.summary?.eligibleCount || 0);
      const msg = count > 0
        ? `You are currently eligible for ${count} government policy options.`
        : 'No direct match yet. Please review guidance to improve eligibility documentation.';
      setMessage(msg);
      addToast({ title: 'Eligibility updated', description: msg, variant: 'success' });
    } catch (err) {
      const msg = err.message || 'Eligibility check failed';
      setError(msg);
      addToast({ title: 'Eligibility check failed', description: msg, variant: 'error' });
    } finally {
      setEvaluating(false);
    }
  };

  const onSave = async () => {
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const payload = buildPayload(form);
      const result = await saveInsuranceProfile(payload);
      setForm(formFromProfile(result?.profile || payload));
      setRecommendations(result?.recommendations || null);
      setMessage('Insurance details saved successfully.');
      addToast({ title: 'Insurance profile saved', variant: 'success' });
    } catch (err) {
      const msg = err.message || 'Failed to save insurance details';
      setError(msg);
      addToast({ title: 'Save failed', description: msg, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <Card variant="glass">
          <CardContent className="py-6">
            <CardTitle className="mb-2">Insurance & Government Policy Checker</CardTitle>
            <p className="text-sm text-gray-600">
              Fill this form to track your existing insurance and instantly see which government health policies may cover you.
            </p>
            <p className="text-xs text-amber-700 mt-2">
              Final approval always depends on official document verification and current government rules.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card variant="outline" hover={false}>
            <CardContent className="space-y-6">
              <CardTitle className="text-lg">Your Insurance Form</CardTitle>

              <section className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">Current Insurance Details</h4>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.hasExistingInsurance} onChange={onChange('hasExistingInsurance')} />
                  I already have health insurance
                </label>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Current insurer(s)</label>
                  <textarea
                    value={form.currentInsurersText}
                    onChange={onChange('currentInsurersText')}
                    placeholder="Example: Star Health, New India Assurance"
                    className="w-full px-3 py-2 border rounded-lg min-h-[80px] focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Policy number</label>
                    <input
                      value={form.currentPolicyNumber}
                      onChange={onChange('currentPolicyNumber')}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Plan type</label>
                    <select
                      value={form.insurancePlanType}
                      onChange={onChange('insurancePlanType')}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="none">None</option>
                      <option value="individual">Individual</option>
                      <option value="family-floater">Family Floater</option>
                      <option value="employer">Employer</option>
                      <option value="government">Government</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Coverage amount (Rs)</label>
                    <input
                      type="number"
                      min="0"
                      value={form.coverageAmount}
                      onChange={onChange('coverageAmount')}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dependents count</label>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      value={form.dependentsCount}
                      onChange={onChange('dependentsCount')}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Coverage notes</label>
                  <textarea
                    value={form.coverageNotes}
                    onChange={onChange('coverageNotes')}
                    placeholder="What treatments are included/excluded in your current plan?"
                    className="w-full px-3 py-2 border rounded-lg min-h-[70px] focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </section>

              <section className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-700">Government Policy Eligibility Inputs</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
                    <input
                      type="number"
                      min="0"
                      max="130"
                      value={form.age}
                      onChange={onChange('age')}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                    <select
                      value={form.gender}
                      onChange={onChange('gender')}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Annual income (Rs)</label>
                    <input
                      type="number"
                      min="0"
                      value={form.annualIncome}
                      onChange={onChange('annualIncome')}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Occupation</label>
                    <select
                      value={form.occupationType}
                      onChange={onChange('occupationType')}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="other">Other</option>
                      <option value="private_salaried">Private salaried</option>
                      <option value="factory_worker">Factory worker</option>
                      <option value="contract_worker">Contract worker</option>
                      <option value="government_employee">Government employee</option>
                      <option value="central_pensioner">Central pensioner</option>
                      <option value="state_pensioner">State pensioner</option>
                      <option value="self_employed">Self-employed</option>
                      <option value="student">Student</option>
                      <option value="homemaker">Homemaker</option>
                      <option value="unemployed">Unemployed</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                    <input
                      value={form.state}
                      onChange={onChange('state')}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                    <input
                      value={form.city}
                      onChange={onChange('city')}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Chronic conditions</label>
                    <textarea
                      value={form.chronicConditions}
                      onChange={onChange('chronicConditions')}
                      placeholder="Example: Kidney disease, heart disease, cancer, diabetes"
                      className="w-full px-3 py-2 border rounded-lg min-h-[70px] focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={form.isBpl} onChange={onChange('isBpl')} />
                    BPL family
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={form.hasRationCard} onChange={onChange('hasRationCard')} />
                    Has ration card
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.isPregnant}
                      onChange={onChange('isPregnant')}
                      disabled={form.gender !== 'female'}
                    />
                    Currently pregnant
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={form.hasDisability} onChange={onChange('hasDisability')} />
                    Has disability certificate
                  </label>
                </div>
              </section>

              {error && <div className="text-sm text-red-600">{error}</div>}
              {message && <div className="text-sm text-green-700">{message}</div>}

              <div className="flex flex-wrap gap-3">
                <Button type="button" loading={evaluating} onClick={onEvaluate}>Check Eligibility</Button>
                <Button type="button" variant="secondary" loading={saving} onClick={onSave}>Save Insurance Profile</Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card variant="outline" hover={false}>
              <CardContent className="space-y-4">
                <CardTitle className="text-lg">Current Coverage Summary</CardTitle>
                <div className="text-sm text-gray-700">
                  <p>
                    Existing insurance:{' '}
                    <span className={`font-semibold ${hasExistingInsurance ? 'text-green-700' : 'text-gray-600'}`}>
                      {hasExistingInsurance ? 'Yes' : 'No'}
                    </span>
                  </p>
                  {hasExistingInsurance && (
                    <p className="mt-2">
                      Insurers: <span className="font-medium">{form.currentInsurersText || 'Not specified'}</span>
                    </p>
                  )}
                  <p className="mt-2">
                    Plan type: <span className="font-medium">{form.insurancePlanType}</span>
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card variant="glass" hover={false}>
              <CardContent className="space-y-4">
                <CardTitle className="text-lg">Eligible Government Policies</CardTitle>
                {loading ? (
                  <p className="text-sm text-gray-500">Loading insurance guidance...</p>
                ) : eligiblePolicies.length === 0 ? (
                  <p className="text-sm text-gray-600">
                    No direct eligibility match yet. Update your details and run "Check Eligibility".
                  </p>
                ) : (
                  <div className="space-y-3">
                    {eligiblePolicies.map((policy) => (
                      <div key={policy.code} className="rounded-lg border border-green-200 bg-green-50 p-3">
                        <div className="text-sm font-semibold text-green-900">{policy.name}</div>
                        <div className="text-xs text-green-800 mt-1">{policy.coverage}</div>
                        <div className="text-xs text-green-700 mt-1">Why eligible: {policy.reason}</div>
                        <div className="text-xs text-green-700 mt-1">{policy.action}</div>
                        {policy.applyUrl && (
                          <a
                            href={policy.applyUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex mt-2 text-xs font-semibold text-green-900 underline hover:text-green-700"
                          >
                            Apply / Check Official Portal
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {guidance.length > 0 && (
                  <div className="pt-2 border-t border-gray-100">
                    <h5 className="text-sm font-semibold text-gray-700 mb-1">Guidance</h5>
                    <ul className="list-disc pl-5 text-xs text-gray-600 space-y-1">
                      {guidance.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card variant="outline" hover={false}>
              <CardContent>
                <CardTitle className="text-lg mb-2">Supported Policy Catalog</CardTitle>
                <div className="text-sm text-gray-700 space-y-1">
                  {(policyCatalog || []).map((policy) => (
                    <div key={policy.code} className="flex items-center justify-between border-b border-gray-100 pb-2 gap-3">
                      <div className="min-w-0">
                        <div>{policy.name}</div>
                        <div className="text-xs text-gray-500">{policy.code}</div>
                      </div>
                      {policy.applyUrl ? (
                        <a
                          href={policy.applyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 text-xs font-medium text-primary-700 underline hover:text-primary-600"
                        >
                          Open
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">N/A</span>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsuranceSupport;
