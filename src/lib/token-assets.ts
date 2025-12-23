export function getTokenLogoSrc(symbol: string) {
  switch (symbol.toUpperCase()) {
    case "SOL":
      return "/tokens/solana.png";
    case "JITOSOL":
      return "/tokens/jitosol.png";
    case "JLP":
      return "/tokens/jlp.png";
    case "ZBTC":
      return "/tokens/btc.svg";
    case "BONK":
      return "/tokens/bonk.png";
    case "PUMP":
      return "/tokens/pump.ico";
    case "ETH":
      return "/tokens/ethereum.png";
    case "USDC":
      return "/tokens/usdc-official.svg";
    default:
      return "/tokens/solana.png";
  }
}


