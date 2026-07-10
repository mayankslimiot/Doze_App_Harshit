import React, { createContext, useContext, useMemo, useState } from 'react';

export type SignupForm = {
  // Step 1
  firstName: string;
  lastName?: string;
  email: string;
  countryCode: string;
  mobile: string;
  country: string;
  pincode: string;
  city?: string;
  house?: string;
  street?: string;
  organizationId?: string;
  // Step 2
  password: string;
  height?: string;
  heightUnit?: 'cm' | 'inch';
  weight?: string;
  weightUnit?: 'kg' | 'lb';
  waist?: string;
  waistUnit?: 'cm' | 'inch';
  dob?: string;
  gender?: 'female' | 'male' | 'undisclosed' | '';
  agree?: boolean;
};

type Ctx = {
  data: SignupForm;
  setField: <K extends keyof SignupForm>(key: K, value: SignupForm[K]) => void;
  reset: () => void;
};

const SignupContext = createContext<Ctx | undefined>(undefined);

const initial: SignupForm = {
  firstName: '',
  lastName: '',
  email: '',
  countryCode: '+91',
  mobile: '',
  country: 'India',
  pincode: '',
  city: '',
  house: '',
  street: '',
  organizationId: 'Select',
  password: '',
  height: '',
  heightUnit: 'cm',
  weight: '',
  weightUnit: 'kg',
  waist: '',
  waistUnit: 'cm',
  dob: '',
  gender: '',
  agree: false,
};

export function SignupProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<SignupForm>(initial);

  const value = useMemo<Ctx>(() => ({
    data,
    setField: (k, v) => setData((s) => ({ ...s, [k]: v })),
    reset: () => setData(initial),
  }), [data]);

  return <SignupContext.Provider value={value}>{children}</SignupContext.Provider>;
}

export function useSignup() {
  const ctx = useContext(SignupContext);
  if (!ctx) throw new Error('useSignup must be used within SignupProvider');
  return ctx;
}