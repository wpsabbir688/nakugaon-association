import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { useLanguage } from '../../contexts/LanguageContext.jsx';
import { apiErrorMessage } from '../../utils/format.js';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function LoginPage() {
  const { lang, t } = useLanguage();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) });
  const onSubmit = async (data) => {
    setError('');
    try {
      const user = await login(data.email, data.password);
      navigate(user.role === 'MEMBER' ? `/${lang}/portal` : `/${lang}/admin`);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  };
  return (
    <div className="max-w-md mx-auto bg-white border rounded-3xl p-8">
      <h1 className="text-2xl font-bold mb-6">{t.loginTitle}</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="text-sm font-medium">{t.email}</label>
          <input {...register('email')} className="w-full border rounded-xl px-3 py-2 mt-1" />
          {errors.email && <p className="text-red-600 text-sm">{errors.email.message}</p>}
        </div>
        <div>
          <label className="text-sm font-medium">{t.password}</label>
          <input type="password" {...register('password')} className="w-full border rounded-xl px-3 py-2 mt-1" />
          {errors.password && <p className="text-red-600 text-sm">{errors.password.message}</p>}
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button disabled={isSubmitting} className="w-full bg-navy-900 text-white rounded-xl py-2 font-medium disabled:opacity-50">
          {t.loginButton}
        </button>
      </form>
    </div>
  );
}
