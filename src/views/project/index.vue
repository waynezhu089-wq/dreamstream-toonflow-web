<template>
  <div class="project">
    <div class="header">
      <div class="fc">
        <span class="title">{{ $t("workbench.project.title") }}</span>
        <span class="sub">{{ $t("workbench.project.subtitle") }}</span>
      </div>
      <t-button
        class="addBtn"
        @click="
          editProjectData = null;
          dialogShow = true;
        ">
        <template #icon><i-plus class="addIcon" :size="20" /></template>
        {{ $t("workbench.project.newProject") }}
      </t-button>
    </div>
    <div class="list">
      <t-card hoverShadow class="card" v-for="project in allProject" :key="project.id" @click="openProject(project.id)">
        <div class="jb ac">
          <div class="title">
            {{ project.name }}
          </div>
          <div>
            <t-tag shape="round">
              {{ getProjectTypeLabel(project) }}
            </t-tag>
          </div>
        </div>
        <t-tag shape="round" v-if="project.artStyle" style="align-self: flex-start">{{ project.artStyle }}</t-tag>
        <div class="intro">
          {{ project.intro }}
        </div>
        <div class="bottomMenu f ac jb">
          <div class="time">
            <span>{{ dayjs(project?.createTime).format("YYYY-MM-DD HH:mm:ss") }}</span>
          </div>
          <div class="actionBtns f ac">
            <t-button v-if="project.projectType === 'general_video' && project.type === 'advertisement'" size="small" variant="text" @click.stop="skillProjectId = Number(project.id)">使用 Skill</t-button>
            <div class="editBtn" @click.stop="openEdit(project)">
              <i-edit :size="18" />
            </div>
            <div class="removeBtn" @click.stop="delProjcer(project.id)">
              <i-delete :size="18" />
            </div>
          </div>
        </div>
      </t-card>
    </div>
  </div>
  <projectDialog v-model="dialogShow" :projectData="editProjectData" @add="addProjectFn" @edit="editProjectFn" />
  <ProjectSkillPicker v-if="skillProjectId" :project-id="skillProjectId" @close="skillProjectId = null" />
</template>

<script setup lang="ts">
import projectDialog from "./components/projectDialog.vue";
import ProjectSkillPicker from "@/components/ProjectSkillPicker.vue";
import dayjs from "dayjs";
import axios from "@/utils/axios";
import { currentAdvertisementUnit, selectAdvertisementUnit, advertisementLocation } from "@/utils/advertisementUnit";
import projectStore from "@/stores/project";
import imageListCacheStore from "@/stores/imageListCache";

const { clearProjectCache } = imageListCacheStore();
const { allProject, project } = storeToRefs(projectStore());

const dialogShow = ref(false);
const skillProjectId = ref<number | null>(null);
const editProjectData = ref<{
  id: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string | null;
  videoRatio: string | null;
  imageModel: string;
  videoModel: string;
  projectType: string;
  imageQuality: "1K" | "2K" | "4K" | "";
  mode: string;
  directorManual: string;
} | null>(null);

async function getAllProject() {
  axios.post("/project/getProject").then(({ data }) => {
    allProject.value = data;
  });
}

onMounted(() => {
  project.value = null;
  getAllProject();
});

const router = useRouter();

async function openProject(projectId: string | undefined) {
  const item = allProject.value.find((p) => p.id === projectId);

  if (!item) return window.$message.error($t("workbench.project.msg.notFound"));

  const advertisement = item.projectType === "general_video" && item.type === "advertisement";
  if (!advertisement && (!item.imageModel || !item.videoModel)) {
    window.$message.warning($t("workbench.project.msg.modelProviderDisabled"));
    return openEdit(item);
  }

  try {
    if (!advertisement && item.imageModel) {
      await axios.post("/modelSelect/getModelDetail", {
        modelId: item.imageModel,
      });
    }
    if (!advertisement && item.videoModel) {
      await axios.post("/modelSelect/getModelDetail", {
        modelId: item.videoModel,
      });
    }
  } catch {
    window.$message.warning($t("workbench.project.msg.modelProviderDisabled"));
    return openEdit(item);
  }

  project.value = item;
  if (item.projectType === "novel") {
    router.push(`/novel`);
  } else if (item.projectType === "script") {
    router.push(`/script`);
  } else if (item.projectType === "general_video") {
    try {
      const unit = await ensureGeneralVideoProductionUnit(item);
      if (project.value?.id !== item.id) return;
      if (item.type === "advertisement") {
        if (!unit) { await router.push("/assets"); return; }
        selectAdvertisementUnit(item.id, unit.id);
        const { data: workflow } = await axios.post("/project/advertisement/getWorkflowState", {
          projectId: Number(item.id), scriptId: Number(unit.id),
        });
        if (project.value?.id !== item.id) return;
        router.push(advertisementLocation(workflow.ready === true && workflow.scriptId === unit.id ? "/production" : "/assets", item.id, unit.id));
      } else {
        router.push("/production");
      }
    } catch (error: any) {
      window.$message.error(error?.message ?? $t("workbench.project.msg.generalVideoInitFailed"));
    }
  }
}

function getProjectTypeLabel(item: { projectType: string; type?: string }) {
  if (item.projectType === "novel") return $t("workbench.project.type.novel");
  if (item.projectType === "general_video" && item.type === "advertisement") return $t("workbench.project.type.advertisement");
  if (item.projectType === "general_video") return $t("workbench.project.type.generalVideo");
  return $t("workbench.project.type.script");
}

async function ensureGeneralVideoProductionUnit(item: {
  id: string;
  name: string;
  intro: string;
  type: string;
}) {
  const projectId = Number(item.id);
  const { data: scripts } = await axios.post("/script/getScrptApi", { projectId });
  if (Array.isArray(scripts) && scripts.length > 0) {
    if (item.type === "advertisement") return scripts.find((unit: any) => unit.id === currentAdvertisementUnit(projectId)) ?? (scripts.length === 1 ? scripts[0] : null);
    return scripts[0];
  }

  await axios.post("/script/addScript", {
    projectId,
    name: `${item.name} - ${$t("workbench.project.type.advertisement")}`,
    content: item.intro || item.name,
    assets: [],
  });

  const { data: createdScripts } = await axios.post("/script/getScrptApi", { projectId });
  if (!Array.isArray(createdScripts) || createdScripts.length === 0) {
    throw new Error($t("workbench.project.msg.generalVideoInitFailed"));
  }
  return createdScripts[0];
}

function openEdit(item: {
  id: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string | null;
  directorManual: string;
  videoRatio: string | null;
  imageModel: string;
  videoModel: string;
  imageQuality: "1K" | "2K" | "4K" | "";
  projectType: string;
  mode: string;
}) {
  editProjectData.value = {
    ...item,
  };
  dialogShow.value = true;
}

function editProjectFn(data: {
  id: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string;
  directorManual: string;
  videoRatio: string;
  imageModel: string;
  videoModel: string;
  projectType: string;
  imageQuality: "1K" | "2K" | "4K" | "";
  mode: string;
}) {
  axios
    .post("/project/editProject", data)
    .then(() => {
      window.$message.success($t("workbench.project.msg.editSuccess"));
      getAllProject();
    })
    .catch((e) => {
      window.$message.error(e.message ?? $t("workbench.project.msg.editFailed"));
    });
}

function addProjectFn(data: {
  projectType: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string;
  directorManual: string;
  videoRatio: string;
  imageModel: string;
  videoModel: string;
  imageQuality: string;
  mode: string;
}) {
  axios
    .post("/project/addProject", data)
    .then(() => {
      window.$message.success($t("workbench.project.msg.addSuccess"));
      getAllProject();
    })
    .catch((e) => {
      window.$message.error(e.message ?? $t("workbench.project.msg.addFailed"));
    });
}

function delProjcer(projectId: string | undefined) {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.project.msg.deleteHeader"),
    body: $t("workbench.project.msg.deleteBody"),
    confirmBtn: $t("workbench.project.msg.deleteConfirm"),
    cancelBtn: $t("workbench.project.msg.deleteCancel"),
    onConfirm: () => {
      axios
        .post("/project/delProject", { id: projectId })
        .then(() => {
          clearProjectCache(projectId!);
          window.$message.success($t("workbench.project.msg.deleteSuccess"));
          getAllProject();
        })
        .catch((e) => {
          window.$message.error(e.message ?? $t("workbench.project.msg.deleteFailed"));
        })
        .finally(() => {
          dialog.destroy();
        });
    },
  });
}
</script>

<style lang="scss" scoped>
.project {
  .header {
    padding-top: 32px;
    margin-bottom: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    .title {
      font-size: 32px;
      font-weight: 600;
      color: var(--td-text-color-primary);
    }
    .sub {
      opacity: 0.5;
      color: var(--td-text-color-secondary);
    }
  }
  .list {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    .card {
      width: 100%;
      height: 100%;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      .title {
        font-size: 20px;
        font-weight: bold;
        margin-bottom: 8px;
      }
      .intro {
        height: 100%;
        margin-top: 5px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .bottomMenu {
        margin-top: 32px;
        .time {
          opacity: 0.5;
        }
        .actionBtns {
          gap: 12px;
        }
        .editBtn {
          cursor: pointer;
          &:hover {
            color: var(--td-brand-color);
          }
        }
        .removeBtn {
          cursor: pointer;
          &:hover {
            color: red;
          }
        }
      }
    }
  }
}
:deep(.t-col) {
  height: auto !important;
}
:deep(.t-card__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
}
</style>
