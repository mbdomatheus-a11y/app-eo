import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ConnectedApp from './ConnectedApp';
import './styles.css';

const demo = import.meta.env.DEV && new URLSearchParams(location.search).get('demo') === '1';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{demo ? <App /> : <ConnectedApp />}</React.StrictMode>);
