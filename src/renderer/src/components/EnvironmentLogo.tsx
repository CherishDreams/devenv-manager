import type React from "react";
import type { EnvironmentDefinition } from "@shared/types";

import javaLogo from "../assets/logos/java.svg";
import pythonLogo from "../assets/logos/python.svg";
import condaLogo from "../assets/logos/conda.svg";
import goLogo from "../assets/logos/go.svg";
import nodeLogo from "../assets/logos/node.svg";
import nvmLogo from "../assets/logos/nvm.svg";
import mavenLogo from "../assets/logos/maven.svg";

type LogoId = EnvironmentDefinition["logoId"];

const imgStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
};

const logos: Record<LogoId, React.ReactElement> = {
  java: <img src={javaLogo} alt="Java" style={imgStyle} />,
  python: <img src={pythonLogo} alt="Python" style={imgStyle} />,
  conda: <img src={condaLogo} alt="Conda" style={imgStyle} />,
  go: <img src={goLogo} alt="Go" style={imgStyle} />,
  node: <img src={nodeLogo} alt="Node.js" style={imgStyle} />,
  nvm: <img src={nvmLogo} alt="NVM" style={imgStyle} />,
  maven: <img src={mavenLogo} alt="Maven" style={imgStyle} />,
};

export function EnvironmentLogo({ definition }: { definition: EnvironmentDefinition }): React.ReactElement {
  return <div className="environment-logo">{logos[definition.logoId]}</div>;
}
