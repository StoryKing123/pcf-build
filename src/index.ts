#!/usr/bin/env node
import { Command } from "commander";
import {
  mkdirSync,
  ensureDirSync,
  ensureFileSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rename,
} from "fs-extra";
import spawn from "cross-spawn";
import { spawnSync } from "child_process";
import xml2js, { parseString, parseStringPromise } from "xml2js";
import path, { PlatformPath } from "path";

type Project = {
  name: string;
  path: string;
  namespace: string;
};

const program = new Command();
const shell = require("shelljs");
// import * as shell from 'shelljs'

const build = new xml2js.Builder();

const initSolution = (prefix: string, name: string) => {
  const pacSolutionInit = shell.exec(
    "pac solution init --publisher-name PCF --publisher-prefix PCF",
    //   "dir"
    { cwd: path.resolve(process.cwd(), "./solution") }
  );

  console.log("add-reference ");
  if (pacSolutionInit.code !== 0) {
    console.error("error");
  }
  shell.exec("pac solution add-reference --path ..\\ ", {
    cwd: path.resolve(process.cwd(), "./solution"),
  });
};

program
  .command("build")
  .version("0.0.1")
  .action(async (option, options) => {
    let projects: Project[] = [];
    // let projects;
    const solutionPath = process.cwd();

    const currentFolder = path.basename(process.cwd());
    const solutionXMLPath = path.resolve(
      process.cwd(),
      "src/Other/Solution.xml"
    );

    // console.log(path.dirname(process.cwd()));

    // console.log(path.basename(path.dirname(process.cwd())));
    // console.log(process.cwd());

    const solutionCdsprojContent = readFileSync(
      path.join(process.cwd(), `${currentFolder}.cdsproj`),
      {
        encoding: "utf-8",
      }
    );

    const solutionCdsprojXml = await parseStringPromise(solutionCdsprojContent);

    // console.log(solutionCdsprojXml.Project.ItemGroup);
    const projectReference = solutionCdsprojXml.Project.ItemGroup.find(
      (itemgroup: any) => {
        return Object.keys(itemgroup).includes("ProjectReference");
      }
    ) as ItemGroup;

    type ItemGroup = { ProjectReference: ProjectReference[] };

    type ProjectReference = { $: { Include: string } };
    // console.log(projectReference);
    const projectsPath = projectReference.ProjectReference.map((reference) => {
      return path.dirname(path.resolve(reference["$"].Include));
    });
    console.log(projectsPath);

    console.log("start run build");
    projects = await Promise.all(await runBuild(projectsPath));

    console.log(projects);

    const solutionContent = readFileSync(solutionXMLPath, {
      encoding: "utf-8",
    });

    // console.log("output res");
    console.log(projects);

    const solutionXML = await parseStringPromise(solutionContent);

    // console.log(solutionXML);
    // console.log(solutionXML.ImportExportXml.SolutionManifest);

    const publisherName =
      solutionXML.ImportExportXml.SolutionManifest[0].Publisher[0]
        .UniqueName[0];

    const publisherPrefix =
      solutionXML.ImportExportXml.SolutionManifest[0].Publisher[0]
        .CustomizationPrefix[0];

    copyPackage(solutionPath);
    assembleProject(projects, publisherName, publisherPrefix, solutionPath);
    copyProjects(projects, publisherName, publisherPrefix, solutionPath);
  });

function assembleProject(
  projects: Project[],
  publisherName: string,
  publisherPrefix: string,
  solutionPath: string
) {
  appendContentType(projects, publisherName, publisherPrefix, solutionPath);

  appendSolution(projects, publisherName, publisherPrefix, solutionPath);

  appendCustomization(projects, publisherName, publisherPrefix, solutionPath);

  // projects.forEach((project) => {
  //content
}

function appendContentType(
  projects: Project[],
  publisherName: string,
  publisherPrefix: string,
  solutionPath: string
) {
  const contentTypesFilePath = path.resolve(
    solutionPath,
    "./package/[Content_Types].xml"
  );

  const overrideContent = projects
    .map((project) => {
      const wholeName = `${publisherPrefix}_${project.namespace}.${project.name}`;
      return `<Override PartName="/Controls/${wholeName}/ControlManifest.xml" ContentType="application/octet-stream" />`;
    })
    .join("");
  console.log(overrideContent);
  writeFileSync(
    contentTypesFilePath,
    `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="text/xml" /><Default Extension="js" ContentType="application/octet-stream" />
    ${overrideContent}
      </Types>`
  );
}

//write a function that conver filename into capitalized name

async function appendSolution(
  projects: Project[],
  publisherName: string,
  publisherPrefix: string,
  solutionPath: string
) {
  const solutionXMLPath = path.resolve(solutionPath, "./package/solution.xml");
  const solutionXMLContent = readFileSync(solutionXMLPath, "utf-8");
  const solutionXML = await parseStringPromise(solutionXMLContent);
  solutionXML.ImportExportXml.SolutionManifest[0].RootComponents = projects.map(
    (project) => {
      const wholeName = `${publisherPrefix}_${project.namespace}.${project.name}`;
      return {
        RootComponent: {
          $: {
            type: 66,
            schemaName: wholeName,
            behavior: "0",
          },
        },
      };
    }
  );
  const modifiedSolutionXmlString = build.buildObject(solutionXML);
  writeFileSync(solutionXMLPath, modifiedSolutionXmlString);
}

async function appendCustomization(
  projects: Project[],
  publisherName: string,
  publisherPrefix: string,
  solutionPath: string
) {
  const customizationsXMLPath = path.resolve(
    solutionPath,
    "./package/customizations.xml"
  );
  const customizationsXMLContent = readFileSync(customizationsXMLPath, "utf-8");
  const customizationsXML = await parseStringPromise(customizationsXMLContent);
  customizationsXML.ImportExportXml.CustomControls = projects.map((project) => {
    const wholeName = `${publisherPrefix}_${project.namespace}.${project.name}`;
    return {
      CustomControl: {
        Name: wholeName,
        FileName: `/Controls/${wholeName}/ControlManifest.xml`,
      },
    };
  });
  const modifiedCustomizationsXmlString = build.buildObject(customizationsXML);
  writeFileSync(customizationsXMLPath, modifiedCustomizationsXmlString);
  // writeFileSync(
  //   path.resolve(solutionPath, "./package/customizations.xml"),
  //   modifiedCustomizationsXmlString,
  //   { flag: "w" }
  // );
  // rename(cost)
}

function copyPackage(solutionPath: string) {
  shell.cp(
    path.resolve(solutionPath, "./src/Other/Customizations.xml"),
    path.resolve(solutionPath, "./package/customizations.xml")
  );
  shell.cp(
    path.resolve(solutionPath, "./src/Other/Solution.xml"),
    path.resolve(solutionPath, "./package/solution.xml")
  );
  // shell.cp(
  //   "-R",
  //   path.resolve(solutionPath, "./src/Other/*"),
  //   path.resolve(solutionPath, "./package")
  // );
}

function copyProjects(
  projects: Project[],
  publisherName: string,
  publisherPrefix: string,
  solutionPath: string
) {
  projects.forEach((project) => {
    const wholeName = `${publisherPrefix}_${project.namespace}.${project.name}`;
    ensureDirSync(path.resolve(solutionPath, `package/Controls/${wholeName}`));
    shell.cp(
      "-R",
      path.resolve(project.path, project.name, "*"),
      path.resolve(solutionPath, `package/Controls/${wholeName}`)
    );
  });
}

async function runBuild(projectsPath: string[]) {
  console.log("start run build");

  const outputPaths = projectsPath.map(async (projectPath) => {
    const outputPath = path.join(projectPath, "./out/controls");
    ensureDirSync(outputPath);
    // console.log(projectPath);
    // console.log(outputPath);
    // const buildRes = shell.exec(
    //   `npm run build -- --noColor --buildMode development --outDir "${outputPath}
    //   " --buildSource MSBuild`,
    //   { cwd: projectPath }
    // );
    const project = readdirSync(outputPath);

    const projectControlManifestXMLContent = readFileSync(
      path.resolve(outputPath, project[0], "ControlManifest.xml"),
      "utf-8"
    );
    const projectControlManifestXML = await parseStringPromise(
      projectControlManifestXMLContent
    );
    // console.log(projectControlManifestXML);
    // console.log(projectControlManifestXML.manifest);
    console.log(projectControlManifestXML.manifest.control);
    const namespace =
      projectControlManifestXML.manifest.control[0]["$"].namespace;
    return { name: project[0], path: outputPath, namespace };
  });
  return outputPaths;
  //todo read from config file?
}

program
  // .description('命令描述') // 命令描述
  .option("-d, --dir <dirname>", "带参选项描述", "选项默认值"); // 带参选项（选项全称 取值时转成驼峰写法），支持设置默认值

program
  .command("is")
  .version("0.0.1")
  .description("子命令描述") // 命令描述
  .option("-pn,<publisherName>", "publisherName") // 参数，必填
  .option("-pp,<publisherPrefix>", "publisherPrefix") // 参数，必填
  /*
          argument 与 option 共存时：参数1为argument，参数2为option；否则参数1是argument或option
          添加多个argument时，依次为action的参数1、参数2、参数3
      */
  .action(async (option, options) => {
    const publisherPrefix = option.Pp;
    const publisherName = option.Pn;

    const publisher = `${publisherPrefix}_${publisherName}`;
    const project = "PCF";

    const projects = readdirSync(path.resolve(process.cwd(), "./out/controls"));
    console.log(projects);

    // shell;
    // const wholeName = `${publisher}.${project}`;
    console.log("start");
    ensureDirSync("solution");
    // const child = spawn(
    //   "pac",
    //   //   [`solution init --publisher-name PCF --publisher-prefix PCF`],
    //   //   "pac solution init --publisher-name PCF --publisher-prefix PCF",
    //   ["init", "--publisher-name", "PCF", "--publisher-prefix", "PCF"],
    //   { stdio: "inherit", cwd: path.resolve(process.cwd(), "./solution") }
    // );
    initSolution(publisherPrefix, publisherName);

    console.log("create file");

    const relationshipFile = path.resolve(
      process.cwd(),
      "./solution/package/[Content_Types].xml"
    );
    ensureFileSync(path.resolve(relationshipFile));

    //todo
    // writeFileSync(
    //   relationshipFile,
    //   `<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="text/xml" /><Default Extension="js" ContentType="application/octet-stream" /><Override PartName="/Controls/${wholeName}/ControlManifest.xml" ContentType="application/octet-stream" /></Types>`
    // );

    // ensureDirSync(
    //   path.resolve(process.cwd(), `./solution/package/Controls/${wholeName}`)
    // );
    console.log("copy build output");

    projects.forEach((project) => {
      const wholeName = `${publisher}.${project}`;
      ensureDirSync(
        path.resolve(process.cwd(), `./solution/package/Controls/${wholeName}`)
      );
      shell.cp(
        "-R",
        path.resolve(process.cwd(), `./out/controls/${project}`),
        path.resolve(process.cwd(), `./solution/package/Controls/${wholeName}`)
      );
    });

    shell.cp(
      "-R",
      path.resolve(process.cwd(), "./solution/src/Other/*"),
      path.resolve("./solution/package")
    );

    //modify solution xml

    const solutionPath = path.resolve(
      process.cwd(),
      "./solution/package/solution.xml"
    );
    let data = readFileSync(solutionPath, { encoding: "utf-8", flag: "r" });
    // console.log(data);
    const xml = await parseStringPromise(data);
    console.log("show xml");

    // console.log(xml.ImportExportXml.SolutionManifest[0].RootComponents);

    xml.ImportExportXml.SolutionManifest[0].RootComponents = [];
    projects.forEach((project) => {
      const wholeName = `${publisher}.${project}`;
      xml.ImportExportXml.SolutionManifest[0].RootComponents.push({
        RootComponents: {
          $: {
            type: 66,
            schemaName: wholeName,
            behavior: "0",
          },
        },
      });
    });

    const builder = new xml2js.Builder();
    const modifiedXmlString = builder.buildObject(xml);
    writeFileSync(solutionPath, modifiedXmlString);
    // console.log(modifiedXmlString);

    const customizationsPath = path.resolve(
      process.cwd(),
      "./solution/package/Customizations.xml"
    );
    const customizationsXmlString = readFileSync(customizationsPath, {
      encoding: "utf-8",
      flag: "r",
    });
    const customizationsXml = await parseStringPromise(customizationsXmlString);
    customizationsXml.ImportExportXml.CustomControls = [];
    projects.forEach((project) => {
      const wholeName = `${publisher}.${project}`;

      customizationsXml.ImportExportXml.CustomControls.push({
        CustomControl: {
          Name: wholeName,
          FileName: `/Controls/${wholeName}/ControlManifest.xml`,
        },
      });
    });

    // const builder = new xml2js.Builder();
    const modifiedCustomizationXmlString =
      builder.buildObject(customizationsXml);
    console.log("show customzation");

    // console.log(modifiedCustomizationXmlString);
    writeFileSync(customizationsPath, modifiedCustomizationXmlString);

    //
  });

program.parse(process.argv);
