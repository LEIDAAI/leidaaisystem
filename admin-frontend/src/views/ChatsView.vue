<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import { useTableMaxHeight } from '@/composables/useTableMax'
import { listChatUsers,listChats,chatMessages,chatAnalysis,deleteChat,restoreChat,exportChat,type ChatItem,type UserChatRow,type ChatAnalysis,type Message } from '@/api/operations'
import { downloadBlobFile } from '@/utils/download'
const auth=useAuthStore()
/** 两级列表表格限高内滚：横向滚动条固定在表格底部，分页吸底悬浮 */
const {max:listMax,bind:bindList}=useTableMaxHeight(96)
const {max:chatsMax,bind:bindChats}=useTableMaxHeight(96)
/** 三级视图：list 用户聚合列表 → user 某用户的对话列表 → chat 单次对话详情 */
const view=ref<'list'|'user'|'chat'>('list')
const query=reactive({phone:'',expertId:'',keyword:'',start:'',end:'',deleted:'',page:1,pageSize:20})
const userRows=ref<UserChatRow[]>([]),total=ref(0),loading=ref(false)
const curUser=ref<UserChatRow>(),userChats=ref<ChatItem[]>([]),userLoading=ref(false)
const curChat=ref<ChatItem>(),messages=ref<Message[]>([]),analysis=ref<ChatAnalysis>(),detailLoading=ref(false)
/** 提问级分析：askIdx = 该会话内第 N 次用户提问（0 基），null = 整个会话 */
const askIdx=ref<number|null>(null)
/** 进入详情前的来源视图，返回时按来源回跳 */
const chatFrom=ref<'list'|'user'>('user')
const tableRows=computed(()=>analysis.value ? analysis.value.table.rows.map(r=>Object.fromEntries(r.map((v,i)=>[`c${i}`,v]))) : [])
async function load(){loading.value=true;try{const data=await listChatUsers(query);if(!data.list.length&&query.page>1){query.page--;await load();return}userRows.value=data.list;total.value=data.total}finally{loading.value=false}}
async function search(){query.page=1;await load()}
/** 聚合行的最新对话 → ChatItem（供打开对话详情） */
function asChat(row:UserChatRow):ChatItem{return {id:row.latest.id,userId:row.userId,expertId:row.latest.expertId,title:row.latest.title,expertName:row.latest.expertName,summary:row.latest.summary,messageCount:row.latest.messageCount,createdAt:row.latest.createdAt,deletedAt:row.latest.deletedAt,deleteReason:row.latest.deleteReason}}
async function openUser(row:UserChatRow){view.value='user';curUser.value=row;userChats.value=[];userLoading.value=true;try{const data=await listChats({userId:row.userId,deleted:'all',page:1,pageSize:100});userChats.value=data.list}finally{userLoading.value=false}}
async function openChat(row:ChatItem,idx?:number){if(view.value!=='chat')chatFrom.value=view.value;view.value='chat';curChat.value=row;askIdx.value=idx??null;messages.value=[];analysis.value=undefined;openTabs.value=['table'];activeTab.value='table';previewCollapsed.value=false;detailLoading.value=true;try{const [ms,an]=await Promise.all([chatMessages(row.id),chatAnalysis(row.id,idx===undefined?undefined:idx)]);messages.value=ms;analysis.value=an}finally{detailLoading.value=false}}
/** 二级行展开：会话ID → 该会话每次用户提问（脱敏），首次展开懒加载 */
const askCache=ref<Record<number,Message[]>>({}),askLoading=ref<Record<number,boolean>>({})
async function onExpandChat(row:ChatItem,expanded:ChatItem[]){if(!expanded.includes(row)||askCache.value[row.id])return;askLoading.value={...askLoading.value,[row.id]:true};try{const ms=await chatMessages(row.id);askCache.value={...askCache.value,[row.id]:ms.filter(m=>m.role==='user')}}finally{askLoading.value={...askLoading.value,[row.id]:false}}}
/** 提问模式下的对话范围：该条用户消息 → 下一条用户消息之前（即这次提问的完整问答过程） */
const askBounds=computed(()=>{if(askIdx.value===null)return null;let n=0;for(let i=0;i<messages.value.length;i++){if(messages.value[i].role!=='user')continue;if(n===askIdx.value){let end=messages.value.length;for(let j=i+1;j<messages.value.length;j++)if(messages.value[j].role==='user'){end=j;break}return [i,end] as const}n++}return null})
const visibleMessages=computed(()=>askBounds.value?messages.value.slice(askBounds.value[0],askBounds.value[1]):messages.value)
const askContent=computed(()=>askBounds.value?messages.value[askBounds.value[0]]:null)
function backToList(){view.value='list';load()}
function backToUser(){if(chatFrom.value==='user'&&curUser.value)openUser(curUser.value);else backToList()}
async function restore(row:ChatItem){try{await ElMessageBox.confirm(`恢复会话 ${row.id}？恢复后用户可继续该会话`,'确认恢复')}catch{return}await restoreChat(row.id);if(curUser.value)await openUser(curUser.value);await load()}
/** 三级详情页操作：软删除当前会话（操作后回到上一级并刷新），与二级列表行为一致 */
async function removeCurrent(){const c=curChat.value;if(!c)return;try{const {value}=await ElMessageBox.prompt('请填写软删除理由，消息会保留以便恢复','软删除',{inputValidator:v=>!!v?.trim() || '必须填写理由'});await deleteChat(c.id,value);if(chatFrom.value==='user'&&curUser.value)await openUser(curUser.value);else backToList()}catch(e){if(e!=='cancel'&&e!=='close')console.error('软删除失败',e)}}
/** 三级详情页操作：恢复已删除会话（原地刷新状态显示） */
async function restoreCurrent(){const c=curChat.value;if(!c)return;try{await ElMessageBox.confirm(`恢复会话 ${c.id}？恢复后用户可继续该会话`,'确认恢复')}catch{return}await restoreChat(c.id);curChat.value={...c,deletedAt:null,deleteReason:''}}
const canDelete=computed(()=>auth.hasPerm('chat:delete')),canRestore=computed(()=>auth.hasPerm('chat:restore')),canExport=computed(()=>auth.hasPerm('chat:export'))
async function download(row:ChatItem,format:string){const data=await exportChat(row.id,format);const blob=data instanceof Blob?data:new Blob([data.content],{type:format==='json'?'application/json':'text/csv;charset=utf-8'});downloadBlobFile(data instanceof Blob?`chat-${row.id}.${format}`:data.filename,blob)}
function downloadReport(){if(!analysis.value||!curChat.value)return;downloadBlobFile(`chat-report-${curChat.value.id}.html`,new Blob([analysis.value.reportHtml],{type:'text/html;charset=utf-8'}))}
function openReport(){if(!analysis.value)return;const url=URL.createObjectURL(new Blob([analysis.value.reportHtml],{type:'text/html;charset=utf-8'}));window.open(url,'_blank');setTimeout(()=>URL.revokeObjectURL(url),60000)}
/** 右侧预览面板（对齐前台 AI 对话交互：点击结果卡片 → 右侧标签页预览，可多开） */
const openTabs=ref<Array<'table'|'report'>>([])
const activeTab=ref<'table'|'report'|''>('')
const previewCollapsed=ref(false)
function openPreview(t:'table'|'report'){if(!openTabs.value.includes(t))openTabs.value.push(t);activeTab.value=t;if(t==='report')reportZoom.value=1}
function closeTab(t:'table'|'report'){openTabs.value=openTabs.value.filter(x=>x!==t);if(activeTab.value===t)activeTab.value=openTabs.value[0]||''}
/* 报告缩放 / 全屏（srcdoc 同源注入 zoom，与前台一致） */
const reportZoom=ref(1),reportPaneEl=ref<HTMLElement|null>(null),reportFrameEl=ref<HTMLIFrameElement|null>(null)
const zoomLabel=computed(()=>Math.round(reportZoom.value*100)+'%')
function applyZoom(){try{const b=reportFrameEl.value?.contentDocument?.body;if(b)b.style.zoom=String(reportZoom.value)}catch(e){}}
function zoomStep(d:number){reportZoom.value=Math.min(2,Math.max(0.5,Math.round((reportZoom.value+d*0.1)*10)/10));applyZoom()}
function zoomReset(){reportZoom.value=1;applyZoom()}
function onFrameLoad(){applyZoom()}
function fullscreenReport(){const el=reportPaneEl.value;if(!el)return;if(document.fullscreenElement){document.exitFullscreen();return}el.requestFullscreen?.().catch(()=>{})}
onMounted(load)
</script>
<template>
<el-alert title="对话为敏感数据；摘要与消息默认脱敏，查看消息/分析过程及导出均留审计。" type="warning" :closable="false" style="margin-bottom:16px"/>
<!-- 视图一：用户视角 —— 一行 = 一个用户 + 其最新一条对话，支持手机号搜索 -->
<el-card v-if="view==='list'" shadow="never">
  <el-form inline @submit.prevent="search">
    <el-form-item label="手机号"><el-input v-model="query.phone" placeholder="支持片段搜索" clearable style="width:150px"/></el-form-item>
    <el-form-item label="专家ID"><el-input v-model="query.expertId" style="width:90px"/></el-form-item>
    <el-form-item><el-input v-model="query.keyword" placeholder="消息关键词" clearable/></el-form-item>
    <el-form-item><el-date-picker v-model="query.start" value-format="YYYY-MM-DD" placeholder="开始日期" style="width:145px"/></el-form-item>
    <el-form-item><el-date-picker v-model="query.end" value-format="YYYY-MM-DD" placeholder="结束日期" style="width:145px"/></el-form-item>
    <el-form-item><el-select v-model="query.deleted" style="width:130px"><el-option label="正常会话" value=""/><el-option label="已软删除" value="true"/><el-option label="全部" value="all"/></el-select></el-form-item>
    <el-button type="primary" @click="search">查询</el-button>
  </el-form>
  <el-table v-loading="loading" :data="userRows" :max-height="listMax" scrollbar-always-on :ref="bindList">
    <el-table-column label="用户" min-width="140"><template #default="{row}"><b>{{row.nickname}}</b> <small style="color:#999">#{{row.userId}}</small><br/><small style="color:#999">{{row.region}}</small></template></el-table-column>
    <el-table-column prop="phone" label="手机号" width="125"/>
    <el-table-column label="对话数" width="85" align="center"><template #default="{row}">{{row.chatCount}}<small v-if="row.chatCount>row.activeCount" style="color:#f56c6c"><br/>删{{row.chatCount-row.activeCount}}</small></template></el-table-column>
    <el-table-column label="对话标题" min-width="180"><template #default="{row}"><span class="ellipsis" :title="row.latest.title">{{row.latest.title || '—'}}</span></template></el-table-column>
    <el-table-column label="最新对话" min-width="270"><template #default="{row}"><el-tag size="small">{{row.latest.expertName || '—'}}</el-tag><div class="ellipsis">{{row.latest.summary}}</div></template></el-table-column>
    <el-table-column prop="latest.createdAt" label="最新对话时间" min-width="165"/>
    <el-table-column label="最新对话状态" width="115"><template #default="{row}">{{row.latest.deletedAt?'已删除':'正常'}}<small v-if="row.latest.deletedAt"><br/>{{row.latest.deleteReason}}</small></template></el-table-column>
    <el-table-column label="操作" width="170" fixed="right"><template #default="{row}"><el-button link type="primary" @click="openUser(row)">对话列表</el-button><el-button link type="primary" @click="openChat(asChat(row))">查看分析</el-button></template></el-table-column>
  </el-table>
  <el-pagination v-model:current-page="query.page" v-model:page-size="query.pageSize" :total="total" layout="total, sizes, prev, pager, next" @current-change="load" @size-change="search" style="margin-top:20px"/>
</el-card>
<!-- 视图二：用户详情 —— 该用户每次发起的对话列表 -->
<el-card v-else-if="view==='user'" shadow="never">
  <el-page-header @back="backToList" :content="`${curUser?.nickname}（${curUser?.phone}）的对话列表`" style="margin-bottom:8px"/>
  <el-descriptions :column="4" size="small" style="margin:12px 0 16px">
    <el-descriptions-item label="用户ID">#{{curUser?.userId}}</el-descriptions-item>
    <el-descriptions-item label="手机号">{{curUser?.phone}}</el-descriptions-item>
    <el-descriptions-item label="地区">{{curUser?.region || '—'}}</el-descriptions-item>
    <el-descriptions-item label="对话总数">{{curUser?.chatCount}}（正常 {{curUser?.activeCount}}）</el-descriptions-item>
  </el-descriptions>
  <el-table v-loading="userLoading" :data="userChats" :max-height="chatsMax" scrollbar-always-on :ref="bindChats" @expand-change="onExpandChat">
    <el-table-column type="expand">
      <template #default="{row}">
        <div v-loading="!!askLoading[row.id]" class="ask-expansion">
          <template v-if="askCache[row.id]?.length">
            <div v-for="(m,i) in askCache[row.id]" :key="i" class="ask-row">
              <el-tag size="small" effect="plain" class="ask-no">第 {{ i + 1 }} 问</el-tag>
              <span class="ask-content" :title="m.content">{{ m.content }}</span>
              <small class="ask-time">{{ m.createdAt }}</small>
              <el-button link type="primary" @click="openChat(row, i)">查看分析</el-button>
            </div>
          </template>
          <el-empty v-else-if="!askLoading[row.id]" description="该会话无用户提问记录" :image-size="48" />
        </div>
      </template>
    </el-table-column>
    <el-table-column prop="id" label="会话ID" width="80"/>
    <el-table-column prop="title" label="对话标题" min-width="180" show-overflow-tooltip/>
    <el-table-column prop="createdAt" label="发起时间" min-width="165"/>
    <el-table-column label="专家" min-width="130"><template #default="{row}">{{row.expertName || '—'}}</template></el-table-column>
    <el-table-column prop="messageCount" label="消息数" width="80" align="center"/>
    <el-table-column prop="summary" label="脱敏摘要" min-width="240" show-overflow-tooltip/>
    <el-table-column label="状态" width="100"><template #default="{row}">{{row.deletedAt?'已删除':'正常'}}</template></el-table-column>
    <el-table-column label="操作" min-width="215" fixed="right"><template #default="{row}"><el-button link type="primary" @click="openChat(row)">查看分析</el-button><el-button v-if="row.deletedAt && canRestore" link @click="restore(row)">恢复</el-button><el-dropdown v-if="canExport" @command="(cmd: string | number | object) => download(row, String(cmd))"><el-button link type="primary">导出 ▾</el-button><template #dropdown><el-dropdown-menu><el-dropdown-item command="json">JSON</el-dropdown-item><el-dropdown-item command="csv">CSV</el-dropdown-item></el-dropdown-menu></template></el-dropdown></template></el-table-column>
  </el-table>
</el-card>
<!-- 视图三：对话详情 —— 左侧分析过程+结果卡片（可点击），右侧预览面板（表格/报告标签，对齐前台 AI 对话） -->
<el-card v-else shadow="never">
  <el-page-header @back="backToUser" :content="askIdx!==null?`会话详情 · 第 ${askIdx+1} 次提问分析`:'会话详情'" style="margin-bottom:8px">
    <template #extra>
      <el-button v-if="curChat && !curChat.deletedAt && canDelete" type="danger" plain size="small" @click="removeCurrent">软删除</el-button>
      <el-button v-else-if="curChat && curChat.deletedAt && canRestore" type="warning" size="small" @click="restoreCurrent">恢复会话</el-button>
    </template>
  </el-page-header>
  <el-descriptions :column="5" size="small" border style="margin:12px 0 16px">
    <el-descriptions-item label="会话ID">#{{curChat?.id}}</el-descriptions-item>
    <el-descriptions-item label="用户">{{curChat?.nickname}} #{{curChat?.userId}}（{{curChat?.phone}}）</el-descriptions-item>
    <el-descriptions-item label="专家">{{curChat?.expertName || '—'}}</el-descriptions-item>
    <el-descriptions-item label="发起时间">{{curChat?.createdAt}}</el-descriptions-item>
    <el-descriptions-item label="状态">{{curChat?.deletedAt?'已删除':'正常'}}</el-descriptions-item>
  </el-descriptions>
  <div v-loading="detailLoading" class="chat-detail" style="min-height:160px">
    <template v-if="analysis">
      <div class="detail-main">
        <!-- 提问模式：本次分析针对的用户问题横幅 -->
        <div v-if="askContent" class="ask-banner">
          <el-tag type="primary" effect="dark" size="small" class="ask-banner-no">第 {{ (askIdx ?? 0) + 1 }} 问</el-tag>
          <div class="ask-banner-main">
            <span class="ask-banner-text">{{ askContent.content }}</span>
            <small class="ask-banner-time">{{ askContent.createdAt }} · 以下为这次提问的对话过程与结果</small>
          </div>
        </div>
        <h4>分析过程</h4>
        <el-timeline style="padding-left:6px;margin:14px 0 26px">
          <el-timeline-item v-for="(s,i) in analysis.steps" :key="i" :timestamp="`${s.at.slice(0,16).replace('T',' ')} · 耗时 ${s.durationSec}s`" placement="top" :type="i===analysis.steps.length-1?'success':'primary'">
            <b>{{i+1}}. {{s.title}}</b>
            <div style="color:#666;font-size:13px;margin:4px 0">{{s.detail}}</div>
            <el-tag v-for="t in s.tools" :key="t" size="small" style="margin-right:6px">{{t}}</el-tag>
          </el-timeline-item>
        </el-timeline>
        <h4>分析结果</h4>
        <div class="result-cards">
          <div class="result-card" :class="{active:activeTab==='table'}" @click="openPreview('table')">
            <span class="rc-icon">📋</span>
            <span class="rc-body"><span class="rc-title">{{analysis.table.title}}</span><span class="rc-meta">{{analysis.table.columns.length}} 个字段 · {{analysis.table.rows.length}} 条候选商品</span></span>
            <span class="rc-hint">点击预览 ›</span>
          </div>
          <div class="result-card" :class="{active:activeTab==='report'}" @click="openPreview('report')">
            <span class="rc-icon">📄</span>
            <span class="rc-body"><span class="rc-title">HTML 选品报告</span><span class="rc-meta">chat-report-{{curChat?.id}}.html</span></span>
            <span class="rc-acts"><el-button size="small" link type="primary" @click.stop="openReport">新窗口打开</el-button><el-button size="small" link type="primary" @click.stop="downloadReport">下载 HTML</el-button></span>
            <span class="rc-hint">点击预览 ›</span>
          </div>
        </div>
        <el-collapse style="margin-top:26px">
          <el-collapse-item :title="askIdx!==null?'本次提问对话（已脱敏）':'对话消息（已脱敏）'">
            <article v-for="(m,i) in visibleMessages" :key="i" style="padding:10px 0;border-bottom:1px solid #eee"><strong>{{m.role==='user'?'用户':'助手'}}</strong><small> · {{m.createdAt}}</small><p style="white-space:pre-wrap;margin:6px 0 0">{{m.content}}</p></article>
            <el-empty v-if="!visibleMessages.length" description="无消息记录" :image-size="60"/>
          </el-collapse-item>
        </el-collapse>
      </div>
      <!-- 右侧预览面板 -->
      <aside class="detail-preview" :class="{collapsed:previewCollapsed}">
        <button type="button" class="pv-collapse-btn" :title="previewCollapsed?'展开预览面板':'折叠预览面板'" @click="previewCollapsed=!previewCollapsed"><span>{{previewCollapsed?'‹':'›'}}</span></button>
        <div class="pv-tabs" v-if="openTabs.length">
          <span v-for="t in openTabs" :key="t" class="pv-tab" :class="{active:t===activeTab}" @click="activeTab=t">
            <span class="pv-tab-name">{{t==='table'?'📋 '+analysis.table.title:'📄 选品报告'}}</span>
            <span class="x" title="关闭此标签" @click.stop="closeTab(t)">×</span>
          </span>
        </div>
        <div v-if="!openTabs.length" class="pv-empty">
          <div class="re-icon">📊</div>
          <div class="pv-e-title">暂无预览内容</div>
          <div class="pv-e-desc">点击左侧「分析结果」卡片<br/>表格或报告会在右侧预览</div>
        </div>
        <div v-else-if="activeTab==='table'" class="pv-body">
          <div class="pv-meta">共 <strong>{{analysis.table.rows.length}}</strong> 条候选商品 · {{analysis.table.columns.length}} 个字段 · 数据来自分析结果</div>
          <el-table :data="tableRows" size="small" border>
            <el-table-column v-for="(col,i) in analysis.table.columns" :key="col" :prop="`c${i}`" :label="col" min-width="92"/>
          </el-table>
        </div>
        <div v-else-if="activeTab==='report'" class="pv-report" ref="reportPaneEl">
          <div class="pv-toolbar">
            <span class="pv-file">📄 chat-report-{{curChat?.id}}.html</span>
            <span class="pv-meta-inline">会话 #{{curChat?.id}} 分析报告预览</span>
          </div>
          <div class="pv-frame-wrap">
            <iframe ref="reportFrameEl" :srcdoc="analysis.reportHtml" sandbox="allow-scripts allow-same-origin allow-popups allow-modals allow-downloads" title="选品报告预览" @load="onFrameLoad"/>
          </div>
          <div class="pv-statusbar">
            <button type="button" class="pv-btn" title="缩小" @click="zoomStep(-1)">−</button>
            <button type="button" class="pv-btn pv-num" title="重置为 100%" @click="zoomReset">{{zoomLabel}}</button>
            <button type="button" class="pv-btn" title="放大" @click="zoomStep(1)">＋</button>
            <span class="pv-spacer"/>
            <button type="button" class="pv-btn" title="新窗口打开" @click="openReport">↗</button>
            <button type="button" class="pv-btn" title="下载独立 HTML 文件" @click="downloadReport">⤓</button>
            <button type="button" class="pv-btn" title="全屏预览" @click="fullscreenReport">⛶</button>
          </div>
        </div>
      </aside>
    </template>
    <el-empty v-else-if="!detailLoading" description="无分析数据"/>
  </div>
</el-card>
</template>
<style scoped>
.ellipsis{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:#666;font-size:13px;margin-top:4px}
/* 三级详情：左主区 + 右预览面板 */
.chat-detail{display:flex;gap:18px;align-items:stretch}
.detail-main{flex:1;min-width:0}
.result-cards{display:flex;flex-direction:column;gap:10px;margin:14px 0 4px}
.result-card{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #dcdfe6;border-radius:8px;background:#fff;cursor:pointer;transition:border-color .15s,box-shadow .15s,background .15s}
.result-card:hover{border-color:#409eff;box-shadow:0 2px 10px rgba(64,158,255,.18)}
.result-card.active{border-color:#409eff;background:#ecf5ff}
.rc-icon{font-size:22px;line-height:1}
.rc-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.rc-title{font-weight:600;font-size:14px;color:#303133;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rc-meta{font-size:12px;color:#909399}
.rc-acts{display:flex;gap:2px;margin-right:6px;flex:none}
.rc-hint{font-size:12px;color:#409eff;white-space:nowrap;flex:none}
/* 预览面板壳 */
.detail-preview{position:sticky;top:16px;width:44%;min-width:400px;max-width:760px;flex:none;border:1px solid #e4e7ed;border-radius:8px;background:#fafafa;display:flex;flex-direction:column;overflow:hidden;align-self:flex-start;height:calc(100vh - 320px);min-height:430px}
.detail-preview.collapsed{width:24px;min-width:24px;max-width:24px;height:220px;min-height:220px}
.detail-preview.collapsed .pv-tabs,.detail-preview.collapsed .pv-body,.detail-preview.collapsed .pv-report,.detail-preview.collapsed .pv-empty{display:none}
.pv-collapse-btn{position:absolute;top:8px;right:6px;z-index:3;width:20px;height:20px;border:1px solid #dcdfe6;border-radius:4px;background:#fff;color:#909399;cursor:pointer;line-height:1;font-size:13px;padding:0}
.pv-collapse-btn:hover{color:#409eff;border-color:#409eff}
.detail-preview.collapsed .pv-collapse-btn{position:sticky;top:8px;right:1px}
/* 标签栏 */
.pv-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:10px 34px 0 10px;border-bottom:1px solid #e4e7ed;background:#f5f7fa}
.pv-tab{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:5px 10px;font-size:12px;border:1px solid #e4e7ed;border-bottom:none;border-radius:6px 6px 0 0;background:#fff;color:#606266;cursor:pointer}
.pv-tab.active{color:#409eff;border-color:#409eff}
.pv-tab-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px}
.pv-tab .x{color:#909399;padding:0 2px}
.pv-tab .x:hover{color:#f56c6c}
/* 空态 / 表格视图 */
.pv-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}
.re-icon{font-size:34px}
.pv-e-title{font-size:14px;color:#606266;font-weight:600}
.pv-e-desc{font-size:12px;color:#c0c4cc;text-align:center;line-height:1.7}
.pv-body{flex:1;overflow:auto;padding:12px;background:#fff}
.pv-meta{font-size:12px;color:#909399;margin-bottom:10px}
.pv-meta strong{color:#409eff}
/* 报告视图 */
.pv-report{flex:1;display:flex;flex-direction:column;overflow:hidden;background:#fff}
.pv-toolbar{display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #ebeef5;background:#f5f7fa;font-size:12px;color:#606266;padding-right:34px}
.pv-file{font-weight:600;color:#303133}
.pv-frame-wrap{flex:1;overflow:hidden}
.pv-frame-wrap iframe{width:100%;height:100%;border:none;background:#fff}
.pv-statusbar{display:flex;align-items:center;gap:6px;padding:6px 12px;border-top:1px solid #ebeef5;background:#f5f7fa}
.pv-btn{border:1px solid #dcdfe6;background:#fff;border-radius:4px;padding:2px 9px;cursor:pointer;font-size:12px;color:#606266;line-height:1.6}
.pv-btn:hover{color:#409eff;border-color:#409eff}
.pv-num{min-width:46px}
.pv-spacer{flex:1}
.pv-meta-inline{color:#c0c4cc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* 二级行展开：该会话每次用户提问 */
.ask-expansion{padding:4px 16px 8px 40px}
.ask-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px dashed #ebeef5}
.ask-row:last-child{border-bottom:none}
.ask-no{flex-shrink:0}
.ask-content{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#303133;font-size:13px}
.ask-time{color:#909399;flex-shrink:0}
/* 三级提问模式：问题横幅 */
.ask-banner{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;margin-bottom:20px;background:#ecf5ff;border:1px solid #d9ecff;border-radius:8px}
.ask-banner-no{flex-shrink:0;margin-top:1px}
.ask-banner-main{flex:1;min-width:0}
.ask-banner-text{display:block;color:#303133;font-size:14px;font-weight:600;white-space:pre-wrap;word-break:break-all}
.ask-banner-time{display:block;color:#909399;font-size:12px;margin-top:4px}
</style>
