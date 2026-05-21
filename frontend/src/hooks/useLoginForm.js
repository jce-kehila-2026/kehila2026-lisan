import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

function useLoginForm() {
  const { t } = useTranslation();
  const [values, setValues] = useState({ email: '', password: '' });
  const [touched, setTouched] = useState({});

  const errors = useMemo(() => {
    const nextErrors = {};

    if (!values.email.trim()) {
      nextErrors.email = t('emailRequired');
    }

    if (!values.password) {
      nextErrors.password = t('passwordRequired');
    } else if (values.password.length < 6) {
      nextErrors.password = t('passwordShort');
    }

    return nextErrors;
  }, [t, values]);

  const setValue = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
  };

  const markTouched = (field) => () => {
    setTouched((current) => ({ ...current, [field]: true }));
  };

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    markTouched,
    setTouched,
    setValue,
    touched,
    values,
  };
}

export default useLoginForm;
