import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ProductsTable } from '../components/ProductVisibility';
import FeedHealthPanel from '../components/FeedHealthPanel';

interface OutletContextType {
  currentBrand?: { _id?: string; name?: string };
}

export default function Products() {
  const context = useOutletContext<OutletContextType>();
  const activeBrandId = context?.currentBrand?._id;
  const [feedRuns, setFeedRuns] = useState(0);
  return (
    <div>
      <div className="panel">
        <h3>Products</h3>
        <p className="sub" style={{ marginBottom: 0 }}>Which of your products AI engines name, from the latest scan. Click a product to see the answers.</p>
      </div>
      {/* Reloads after a new feed check so the Feed column is current */}
      <ProductsTable brandId={activeBrandId} key={`${activeBrandId}-${feedRuns}`} />
      <FeedHealthPanel brandId={activeBrandId} key={`feed-${activeBrandId}`} onChecked={() => setFeedRuns((n) => n + 1)} />
    </div>
  );
}
