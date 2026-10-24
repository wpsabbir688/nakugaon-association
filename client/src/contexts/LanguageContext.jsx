import { createContext, useContext } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { dict } from '../i18n/dictionaries.js';

const LanguageContext = createContext({ lang: 'bn', t: dict('bn'), switchLang: () => {} });
export function useLanguage() {
  return useContext(LanguageContext);
}

export function LanguageProvider({ children }) {
  const { lang = 'bn' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const safeLang = lang === 'en' ? 'en' : 'bn';
  const switchLang = (next) => {
    const parts = location.pathname.split('/');
    parts[1] = next;
    navigate(parts.join('/') + location.search);
  };
  return (
    <LanguageContext.Provider value={{ lang: safeLang, t: dict(safeLang), switchLang }}>
      {children}
    </LanguageContext.Provider>
  );
}
