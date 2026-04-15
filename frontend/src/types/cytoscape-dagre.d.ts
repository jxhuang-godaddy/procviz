declare module "cytoscape-dagre" {
  import { use } from "cytoscape";
  const dagre: Parameters<typeof use>[0];
  export default dagre;
}
