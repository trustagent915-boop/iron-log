import coreWebVitals from "eslint-config-next/core-web-vitals";

// eslint-config-next 16 espone configurazioni flat native: niente piu'
// FlatCompat, che in v16 non riesce a caricare "next/core-web-vitals".
const config = [
  {
    ignores: [".next/**", "node_modules/**"]
  },
  ...coreWebVitals,
  {
    rules: {
      // Le pagine copiano nello stato React valori che esistono solo nel
      // browser (query string, pathname, localStorage) dopo l idratazione:
      // e il pattern corretto per l SSR. Spostarli in inizializzatori lazy
      // creerebbe mismatch di idratazione. La regola introdotta con
      // eslint-config-next 16 li segnalerebbe tutti come errori.
      "react-hooks/set-state-in-effect": "off"
    }
  }
];

export default config;
