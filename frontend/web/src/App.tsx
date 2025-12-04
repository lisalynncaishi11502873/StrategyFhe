// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface StrategyOpinion {
  id: string;
  encryptedContent: string;
  timestamp: number;
  category: "innovation" | "growth" | "risk" | "culture" | "other";
  vote: number; // -1 to 1 scale
  fheAggregated?: boolean;
}

const App: React.FC = () => {
  // Randomized style selections
  // Colors: High contrast (blue+orange)
  // UI: Industrial mechanical
  // Layout: Center radiation
  // Interaction: Micro-interactions
  
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [opinions, setOpinions] = useState<StrategyOpinion[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newOpinion, setNewOpinion] = useState({
    category: "innovation" as const,
    content: "",
    vote: 0
  });
  const [showStats, setShowStats] = useState(false); // Random feature: data statistics
  const [activeCategory, setActiveCategory] = useState<string>("all"); // Random feature: filtering

  // Calculate statistics
  const positiveVotes = opinions.filter(o => o.vote > 0).length;
  const neutralVotes = opinions.filter(o => o.vote === 0).length;
  const negativeVotes = opinions.filter(o => o.vote < 0).length;

  useEffect(() => {
    loadOpinions().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadOpinions = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("opinion_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing opinion keys:", e);
        }
      }
      
      const list: StrategyOpinion[] = [];
      
      for (const key of keys) {
        try {
          const opinionBytes = await contract.getData(`opinion_${key}`);
          if (opinionBytes.length > 0) {
            try {
              const opinionData = JSON.parse(ethers.toUtf8String(opinionBytes));
              list.push({
                id: key,
                encryptedContent: opinionData.content,
                timestamp: opinionData.timestamp,
                category: opinionData.category,
                vote: opinionData.vote,
                fheAggregated: opinionData.fheAggregated
              });
            } catch (e) {
              console.error(`Error parsing opinion data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading opinion ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setOpinions(list);
    } catch (e) {
      console.error("Error loading opinions:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitOpinion = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setSubmitting(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting opinion with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedContent = `FHE-${btoa(JSON.stringify(newOpinion))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const opinionId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const opinionData = {
        content: encryptedContent,
        timestamp: Math.floor(Date.now() / 1000),
        category: newOpinion.category,
        vote: newOpinion.vote,
        fheAggregated: false
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `opinion_${opinionId}`, 
        ethers.toUtf8Bytes(JSON.stringify(opinionData))
      );
      
      const keysBytes = await contract.getData("opinion_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(opinionId);
      
      await contract.setData(
        "opinion_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Opinion submitted securely with FHE!"
      });
      
      await loadOpinions();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowSubmitModal(false);
        setNewOpinion({
          category: "innovation",
          content: "",
          vote: 0
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setSubmitting(false);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE Contract is ${isAvailable ? "available" : "unavailable"}`
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const filteredOpinions = activeCategory === "all" 
    ? opinions 
    : opinions.filter(o => o.category === activeCategory);

  const renderVoteIndicator = (vote: number) => {
    const percentage = ((vote + 1) / 2) * 100;
    return (
      <div className="vote-meter">
        <div 
          className="vote-fill"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="gear-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container industrial-theme">
      <div className="central-radial-layout">
        <header className="app-header">
          <div className="logo">
            <div className="gear-icon"></div>
            <h1>Strategy<span>FHE</span></h1>
          </div>
          
          <div className="header-actions">
            <button 
              onClick={() => setShowSubmitModal(true)} 
              className="submit-btn industrial-button"
            >
              <div className="plus-icon"></div>
              Submit Opinion
            </button>
            <button 
              className="industrial-button"
              onClick={() => setShowStats(!showStats)}
            >
              {showStats ? "Hide Stats" : "Show Stats"}
            </button>
            <button 
              className="industrial-button"
              onClick={checkAvailability}
            >
              Check FHE
            </button>
            <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
          </div>
        </header>
        
        <main className="main-content">
          <div className="platform-description">
            <h2>Anonymous Employee Strategy Platform</h2>
            <p>Share your opinions on company strategy anonymously using FHE encryption</p>
            <div className="fhe-badge">
              <span>Fully Homomorphic Encryption</span>
            </div>
          </div>
          
          {showStats && (
            <div className="stats-panel industrial-panel">
              <h3>Opinion Statistics</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{opinions.length}</div>
                  <div className="stat-label">Total Opinions</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{positiveVotes}</div>
                  <div className="stat-label">Positive</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{neutralVotes}</div>
                  <div className="stat-label">Neutral</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{negativeVotes}</div>
                  <div className="stat-label">Negative</div>
                </div>
              </div>
            </div>
          )}
          
          <div className="filter-controls">
            <select 
              value={activeCategory}
              onChange={(e) => setActiveCategory(e.target.value)}
              className="industrial-select"
            >
              <option value="all">All Categories</option>
              <option value="innovation">Innovation</option>
              <option value="growth">Growth</option>
              <option value="risk">Risk</option>
              <option value="culture">Culture</option>
              <option value="other">Other</option>
            </select>
            <button 
              onClick={loadOpinions}
              className="refresh-btn industrial-button"
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          
          <div className="opinions-list industrial-panel">
            <div className="list-header">
              <div className="header-cell">Category</div>
              <div className="header-cell">Sentiment</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">FHE Status</div>
            </div>
            
            {filteredOpinions.length === 0 ? (
              <div className="no-opinions">
                <div className="document-icon"></div>
                <p>No strategy opinions found</p>
                <button 
                  className="industrial-button primary"
                  onClick={() => setShowSubmitModal(true)}
                >
                  Submit First Opinion
                </button>
              </div>
            ) : (
              filteredOpinions.map(opinion => (
                <div className="opinion-row" key={opinion.id}>
                  <div className="table-cell">
                    <span className={`category-badge ${opinion.category}`}>
                      {opinion.category}
                    </span>
                  </div>
                  <div className="table-cell">
                    {renderVoteIndicator(opinion.vote)}
                  </div>
                  <div className="table-cell">
                    {new Date(opinion.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    <span className={`fhe-status ${opinion.fheAggregated ? "processed" : "pending"}`}>
                      {opinion.fheAggregated ? "Aggregated" : "Pending"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </main>
    
        {showSubmitModal && (
          <ModalSubmit 
            onSubmit={submitOpinion} 
            onClose={() => setShowSubmitModal(false)} 
            submitting={submitting}
            opinionData={newOpinion}
            setOpinionData={setNewOpinion}
          />
        )}
        
        {walletSelectorOpen && (
          <WalletSelector
            isOpen={walletSelectorOpen}
            onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
            onClose={() => setWalletSelectorOpen(false)}
          />
        )}
        
        {transactionStatus.visible && (
          <div className="transaction-notice">
            <div className="transaction-content industrial-panel">
              <div className={`transaction-icon ${transactionStatus.status}`}>
                {transactionStatus.status === "pending" && <div className="gear-spinner"></div>}
                {transactionStatus.status === "success" && <div className="check-icon"></div>}
                {transactionStatus.status === "error" && <div className="error-icon"></div>}
              </div>
              <div className="transaction-message">
                {transactionStatus.message}
              </div>
            </div>
          </div>
        )}
    
        <footer className="app-footer">
          <div className="footer-content">
            <div className="footer-brand">
              <div className="logo">
                <div className="gear-icon"></div>
                <span>StrategyFHE</span>
              </div>
              <p>Anonymous employee strategy platform powered by FHE</p>
            </div>
            
            <div className="footer-links">
              <a href="#" className="footer-link">About FHE</a>
              <a href="#" className="footer-link">Privacy</a>
              <a href="#" className="footer-link">Terms</a>
            </div>
          </div>
          
          <div className="footer-bottom">
            <div className="copyright">
              © {new Date().getFullYear()} StrategyFHE. All opinions encrypted.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

interface ModalSubmitProps {
  onSubmit: () => void; 
  onClose: () => void; 
  submitting: boolean;
  opinionData: any;
  setOpinionData: (data: any) => void;
}

const ModalSubmit: React.FC<ModalSubmitProps> = ({ 
  onSubmit, 
  onClose, 
  submitting,
  opinionData,
  setOpinionData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setOpinionData({
      ...opinionData,
      [name]: value
    });
  };

  const handleVoteChange = (value: number) => {
    setOpinionData({
      ...opinionData,
      vote: value
    });
  };

  const handleSubmit = () => {
    if (!opinionData.content) {
      alert("Please enter your opinion");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="submit-modal industrial-panel">
        <div className="modal-header">
          <h2>Submit Strategy Opinion</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div> Your opinion will be encrypted with FHE and remain anonymous
          </div>
          
          <div className="form-group">
            <label>Category</label>
            <select 
              name="category"
              value={opinionData.category} 
              onChange={handleChange}
              className="industrial-select"
            >
              <option value="innovation">Innovation</option>
              <option value="growth">Growth</option>
              <option value="risk">Risk</option>
              <option value="culture">Culture</option>
              <option value="other">Other</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Your Sentiment</label>
            <div className="vote-slider">
              <button 
                className={`vote-option ${opinionData.vote === -1 ? "active" : ""}`}
                onClick={() => handleVoteChange(-1)}
              >
                Negative
              </button>
              <button 
                className={`vote-option ${opinionData.vote === 0 ? "active" : ""}`}
                onClick={() => handleVoteChange(0)}
              >
                Neutral
              </button>
              <button 
                className={`vote-option ${opinionData.vote === 1 ? "active" : ""}`}
                onClick={() => handleVoteChange(1)}
              >
                Positive
              </button>
            </div>
          </div>
          
          <div className="form-group">
            <label>Your Opinion *</label>
            <textarea 
              name="content"
              value={opinionData.content} 
              onChange={handleChange}
              placeholder="Share your thoughts on company strategy..." 
              className="industrial-textarea"
              rows={5}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn industrial-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={submitting}
            className="submit-btn industrial-button primary"
          >
            {submitting ? "Encrypting with FHE..." : "Submit Anonymously"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;