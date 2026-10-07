import { useOutletContext } from 'react-router-dom';
import { ProductsTable } from '../components/ProductVisibility';
import FeedHealthPanel from '../components/FeedHealthPanel';

interface OutletContextType {
  currentBrand?: { _id?: string; name?: string };
}

export default function Products() {
  const context = useOutletContext<OutletContextType>();
  const activeBrandId = context?.currentBrand?._id;
  return (
    <div>
      <div className="panel">
        <h3>Products</h3>
        <p className="sub" style={{ marginBottom: 0 }}>Which of your products AI engines name, from the latest scan. Click a product to see the answers.</p>
      </div>
      <ProductsTable brandId={activeBrandId} key={activeBrandId} />
      <FeedHealthPanel brandId={activeBrandId} key={`feed-${activeBrandId}`} />
    </div>
  );
}
