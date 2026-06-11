import type { EnvironmentDefinition } from "@shared/types";
import type React from "react";

import androidLogo from "../assets/logos/android.svg";
import cmakeLogo from "../assets/logos/cmake.svg";
import condaLogo from "../assets/logos/conda.svg";
import cppLogo from "../assets/logos/cpp.svg";
import dotnetLogo from "../assets/logos/dotnet.svg";
import flutterLogo from "../assets/logos/flutter.svg";
import goLogo from "../assets/logos/go.svg";
import gradleLogo from "../assets/logos/gradle.svg";
import javaLogo from "../assets/logos/java.svg";
import luaLogo from "../assets/logos/lua.svg";
import mavenLogo from "../assets/logos/maven.svg";
import mongodbLogo from "../assets/logos/mongodb.svg";
import mysqlLogo from "../assets/logos/mysql.svg";
import ninjaLogo from "../assets/logos/ninja.svg";
import nodeLogo from "../assets/logos/node.svg";
import nvmLogo from "../assets/logos/nvm.svg";
import phpLogo from "../assets/logos/php.svg";
import postgresqlLogo from "../assets/logos/postgresql.svg";
import pythonLogo from "../assets/logos/python.svg";
import redisLogo from "../assets/logos/redis.svg";
import rubyLogo from "../assets/logos/ruby.svg";
import rustLogo from "../assets/logos/rust.svg";
import sqliteLogo from "../assets/logos/sqlite.svg";

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
  gradle: <img src={gradleLogo} alt="Gradle" style={imgStyle} />,
  cmake: <img src={cmakeLogo} alt="CMake" style={imgStyle} />,
  ninja: <img src={ninjaLogo} alt="Ninja" style={imgStyle} />,
  cpp: <img src={cppLogo} alt="C++" style={imgStyle} />,
  lua: <img src={luaLogo} alt="Lua" style={imgStyle} />,
  rust: <img src={rustLogo} alt="Rust" style={imgStyle} />,
  dotnet: <img src={dotnetLogo} alt=".NET SDK" style={imgStyle} />,
  php: <img src={phpLogo} alt="PHP" style={imgStyle} />,
  ruby: <img src={rubyLogo} alt="Ruby" style={imgStyle} />,
  flutter: <img src={flutterLogo} alt="Flutter" style={imgStyle} />,
  android: <img src={androidLogo} alt="Android SDK" style={imgStyle} />,
  mysql: <img src={mysqlLogo} alt="MySQL" style={imgStyle} />,
  postgresql: <img src={postgresqlLogo} alt="PostgreSQL" style={imgStyle} />,
  mongodb: <img src={mongodbLogo} alt="MongoDB" style={imgStyle} />,
  redis: <img src={redisLogo} alt="Redis" style={imgStyle} />,
  sqlite: <img src={sqliteLogo} alt="SQLite" style={imgStyle} />,
};

export function EnvironmentLogo({ definition }: { definition: EnvironmentDefinition }): React.ReactElement {
  return <div className="environment-logo">{logos[definition.logoId]}</div>;
}
