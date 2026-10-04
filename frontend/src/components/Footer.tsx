import { SITE_URL } from '../utils/siteUrl';

export default function Footer() {
  return (
    <footer className="app-footer">
      <div>Signal · AI Visibility System</div>
      <div className="foot-links">
        <a href={`${SITE_URL}/legal/privacy`} target="_blank" rel="noreferrer">Privacy</a>
        <a href={`${SITE_URL}/legal/terms`} target="_blank" rel="noreferrer">Terms</a>
        <a href={`${SITE_URL}/contact`} target="_blank" rel="noreferrer">Contact</a>
      </div>
    </footer>
  );
}
