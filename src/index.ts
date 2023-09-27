#!/usr/bin/env node
import { Command } from "commander";
import {
  ensureDirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  createWriteStream,
  emptyDirSync,
} from "fs-extra";
import xml2js, { parseString, parseStringPromise } from "xml2js";
import path from "path";
import * as archive from "archiver";

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
  .version("1.0.4")
  .option("-o, --output <output>", "output dir")
  .option("-f, --file <filename>", "file name")
  .action(async (option) => {
    // console.log(option);
    const outputDir = option?.output ?? "package";
    const fileName = option?.file ?? "Solution.zip";
    let projects: Project[] = [];
    const solutionPath = process.cwd();
    const currentFolder = path.basename(process.cwd());
    // const outputName = "package";
    const solutionXMLPath = path.resolve(
      process.cwd(),
      "src/Other/Solution.xml"
    );
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

    const publisherName =
      solutionXML.ImportExportXml.SolutionManifest[0].Publisher[0]
        .UniqueName[0];

    const publisherPrefix =
      solutionXML.ImportExportXml.SolutionManifest[0].Publisher[0]
        .CustomizationPrefix[0];

    clearDist(solutionPath, outputDir);

    copyPackage(solutionPath, outputDir);
    assembleProject(
      projects,
      publisherName,
      publisherPrefix,
      solutionPath,
      outputDir
    );
    copyProjects(
      projects,
      publisherName,
      publisherPrefix,
      solutionPath,
      outputDir
    );
    compress(solutionPath, outputDir, fileName);
  });

function clearDist(solutionPath: string, outputDir: string) {
  emptyDirSync(path.resolve(solutionPath, outputDir));
}

function compress(solutionPath: string, outputDir: string, fileName: string) {
  const compressor = archive.create("zip", {});
  compressor.directory(path.resolve(solutionPath, outputDir), false);
  const output = createWriteStream(
    path.resolve(solutionPath, `${fileName}.zip`)
  );
  compressor.pipe(output);
  compressor.finalize();
}

function assembleProject(
  projects: Project[],
  publisherName: string,
  publisherPrefix: string,
  solutionPath: string,
  outputDir: string
) {
  appendContentType(
    projects,
    publisherName,
    publisherPrefix,
    solutionPath,
    outputDir
  );

  appendSolution(
    projects,
    publisherName,
    publisherPrefix,
    solutionPath,
    outputDir
  );

  appendCustomization(
    projects,
    publisherName,
    publisherPrefix,
    solutionPath,
    outputDir
  );

  // projects.forEach((project) => {
  //content
}

function appendContentType(
  projects: Project[],
  publisherName: string,
  publisherPrefix: string,
  solutionPath: string,
  outputDir: string
) {
  const contentTypesFilePath = path.resolve(
    solutionPath,
    `./${outputDir}/[Content_Types].xml`
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
  solutionPath: string,
  outputDir: string
) {
  const solutionXMLPath = path.resolve(
    solutionPath,
    `./${outputDir}/solution.xml`
  );
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
  solutionPath: string,
  outputDir: string
) {
  const customizationsXMLPath = path.resolve(
    solutionPath,
    `./${outputDir}/customizations.xml`
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
}

function copyPackage(solutionPath: string, outputDir: string) {
  shell.cp(
    path.resolve(solutionPath, "./src/Other/Customizations.xml"),
    path.resolve(solutionPath, `./${outputDir}/customizations.xml`)
  );
  shell.cp(
    path.resolve(solutionPath, "./src/Other/Solution.xml"),
    path.resolve(solutionPath, `./${outputDir}/solution.xml`)
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
  solutionPath: string,
  outputDir: string
) {
  projects.forEach((project) => {
    const wholeName = `${publisherPrefix}_${project.namespace}.${project.name}`;
    ensureDirSync(
      path.resolve(solutionPath, `${outputDir}/Controls/${wholeName}`)
    );
    shell.cp(
      "-R",
      path.resolve(project.path, project.name, "*"),
      path.resolve(solutionPath, `${outputDir}/Controls/${wholeName}`)
    );
  });
}

async function runBuild(projectsPath: string[]) {
  console.log(`${projectsPath} start run build`);

  const outputPaths = projectsPath.map(async (projectPath) => {
    //get pcf config file pcfconfig.json
    const PCFConfig = require(path.join(projectPath, "pcfconfig.json"));
    if (!PCFConfig || !PCFConfig.outDir) {
      console.error(
        "Please make sure you have set outDir in pcfconfig.json file"
      );
      throw new Error(
        "Please make sure you have set outDir in pcfconfig.json file"
      );
    }
    const outDir = PCFConfig.outDir;

    const outputPath = path.join(projectPath, outDir);
    ensureDirSync(outputPath);
    const buildRes = shell.exec(
      // `npm run build -- --noColor --buildMode development --outDir "${outputPath}
      `npm run build -- --noColor --buildMode development --buildSource MSBuild`,
      { cwd: projectPath }
    );
    const project = readdirSync(outputPath);

    const projectControlManifestXMLContent = readFileSync(
      path.resolve(outputPath, project[0], "ControlManifest.xml"),
      "utf-8"
    );
    const projectControlManifestXML = await parseStringPromise(
      projectControlManifestXMLContent
    );
    const namespace =
      projectControlManifestXML.manifest.control[0]["$"].namespace;
    return { name: project[0], path: outputPath, namespace };
  });
  return outputPaths;
  //todo read from config file?
}
program.parse(process.argv);
