import { Content, displayFlex } from '@affine/component';
import {
  AppSidebarFallback,
  appSidebarResizingAtom,
} from '@affine/component/app-sidebar';
import { BlockHubWrapper } from '@affine/component/block-hub';
import type { DraggableTitleCellData } from '@affine/component/page-list';
import { StyledTitleLink } from '@affine/component/page-list';
import {
  MainContainer,
  ToolContainer,
  WorkspaceFallback,
} from '@affine/component/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  rootBlockHubAtom,
  rootWorkspacesMetadataAtom,
} from '@affine/workspace/atom';
import { assertExists } from '@blocksuite/global/utils';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  useDndContext,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { currentWorkspaceIdAtom } from '@toeverything/infra/atom';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { nanoid } from 'nanoid';
import type { PropsWithChildren, ReactElement } from 'react';
import { lazy, Suspense, useCallback, useEffect } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Map as YMap } from 'yjs';

import { openQuickSearchModalAtom, openSettingModalAtom } from '../atoms';
import { mainContainerAtom } from '../atoms/element';
import { useAppSetting } from '../atoms/settings';
import { AdapterProviderWrapper } from '../components/adapter-worksapce-wrapper';
import { AppContainer } from '../components/affine/app-container';
import { usePageHelper } from '../components/blocksuite/block-suite-page-list/utils';
import { MigrationFallback } from '../components/migration-fallback';
import type { IslandItemNames } from '../components/pure/help-island';
import { HelpIsland } from '../components/pure/help-island';
import { processCollectionsDrag } from '../components/pure/workspace-slider-bar/collections';
import {
  DROPPABLE_SIDEBAR_TRASH,
  RootAppSidebar,
} from '../components/root-app-sidebar';
import { useBlockSuiteMetaHelper } from '../hooks/affine/use-block-suite-meta-helper';
import { useCurrentWorkspace } from '../hooks/current/use-current-workspace';
import { useNavigateHelper } from '../hooks/use-navigate-helper';
import { useRegisterWorkspaceCommands } from '../hooks/use-register-workspace-commands';
import {
  AllWorkspaceModals,
  CurrentWorkspaceModals,
} from '../providers/modal-provider';
import { pathGenerator } from '../shared';
import { toast } from '../utils';

const CMDKQuickSearchModal = lazy(() =>
  import('../components/pure/cmdk').then(module => ({
    default: module.CMDKQuickSearchModal,
  }))
);

export const QuickSearch = () => {
  const [openQuickSearchModal, setOpenQuickSearchModalAtom] = useAtom(
    openQuickSearchModalAtom
  );

  const [currentWorkspace] = useCurrentWorkspace();
  const { pageId } = useParams();
  const blockSuiteWorkspace = currentWorkspace?.blockSuiteWorkspace;
  const pageMeta = useBlockSuitePageMeta(
    currentWorkspace?.blockSuiteWorkspace
  ).find(meta => meta.id === pageId);

  if (!blockSuiteWorkspace) {
    return null;
  }

  return (
    <CMDKQuickSearchModal
      open={openQuickSearchModal}
      onOpenChange={setOpenQuickSearchModalAtom}
      pageMeta={pageMeta}
    />
  );
};

const showList: IslandItemNames[] = environment.isDesktop
  ? ['whatNew', 'contact', 'guide']
  : ['whatNew', 'contact'];

export const CurrentWorkspaceContext = ({
  children,
}: PropsWithChildren): ReactElement => {
  const workspaceId = useAtomValue(currentWorkspaceIdAtom);
  const metadata = useAtomValue(rootWorkspacesMetadataAtom);
  const exist = metadata.find(m => m.id === workspaceId);
  if (metadata.length === 0) {
    return <WorkspaceFallback key="no-workspace" />;
  }
  if (!workspaceId) {
    return <WorkspaceFallback key="finding-workspace-id" />;
  }
  if (!exist) {
    return <WorkspaceFallback key="workspace-not-found" />;
  }
  return <>{children}</>;
};

type WorkspaceLayoutProps = {
  incompatible?: boolean;
};

export const WorkspaceLayout = function WorkspacesSuspense({
  children,
  incompatible = false,
}: PropsWithChildren<WorkspaceLayoutProps>) {
  return (
    <AdapterProviderWrapper>
      <CurrentWorkspaceContext>
        {/* load all workspaces is costly, do not block the whole UI */}
        <Suspense>
          <AllWorkspaceModals />
          <CurrentWorkspaceModals />
        </Suspense>
        <Suspense fallback={<WorkspaceFallback />}>
          <WorkspaceLayoutInner incompatible={incompatible}>
            {children}
          </WorkspaceLayoutInner>
        </Suspense>
      </CurrentWorkspaceContext>
    </AdapterProviderWrapper>
  );
};

export const WorkspaceLayoutInner = ({
  children,
  incompatible = false,
}: PropsWithChildren<WorkspaceLayoutProps>) => {
  const [currentWorkspace] = useCurrentWorkspace();
  const { openPage } = useNavigateHelper();
  const pageHelper = usePageHelper(currentWorkspace.blockSuiteWorkspace);
  const t = useAFFiNEI18N();

  useRegisterWorkspaceCommands();

  useEffect(() => {
    // hotfix for blockVersions
    // this is a mistake in the
    //    0.8.0 ~ 0.8.1
    //    0.8.0-beta.0 ~ 0.8.0-beta.3
    //    0.8.0-canary.17 ~ 0.9.0-canary.3
    const meta = currentWorkspace.blockSuiteWorkspace.doc.getMap('meta');
    const blockVersions = meta.get('blockVersions');
    if (
      !(blockVersions instanceof YMap) &&
      blockVersions != null &&
      typeof blockVersions === 'object'
    ) {
      meta.set(
        'blockVersions',
        new YMap(Object.entries(blockVersions as Record<string, number>))
      );
    }
  }, [currentWorkspace.blockSuiteWorkspace.doc]);

  const handleCreatePage = useCallback(() => {
    const id = nanoid();
    pageHelper.createPage(id);
    const page = currentWorkspace.blockSuiteWorkspace.getPage(id);
    assertExists(page);
    return page;
  }, [currentWorkspace.blockSuiteWorkspace, pageHelper]);

  const [, setOpenQuickSearchModalAtom] = useAtom(openQuickSearchModalAtom);
  const handleOpenQuickSearchModal = useCallback(() => {
    setOpenQuickSearchModalAtom(true);
  }, [setOpenQuickSearchModalAtom]);

  const setOpenSettingModalAtom = useSetAtom(openSettingModalAtom);

  const handleOpenSettingModal = useCallback(() => {
    setOpenSettingModalAtom({
      activeTab: 'appearance',
      workspaceId: null,
      open: true,
    });
  }, [setOpenSettingModalAtom]);

  const resizing = useAtomValue(appSidebarResizingAtom);

  const sensors = useSensors(
    // Delay 10ms after mousedown
    // Otherwise clicks would be intercepted
    useSensor(MouseSensor, {
      activationConstraint: {
        delay: 500,
        tolerance: 10,
      },
    })
  );

  const { removeToTrash: moveToTrash } = useBlockSuiteMetaHelper(
    currentWorkspace.blockSuiteWorkspace
  );

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      // Drag page into trash folder
      if (
        e.over?.id === DROPPABLE_SIDEBAR_TRASH &&
        String(e.active.id).startsWith('page-list-item-')
      ) {
        const { pageId } = e.active.data.current as DraggableTitleCellData;
        // TODO-Doma
        // Co-locate `moveToTrash` with the toast for reuse, as they're always used together
        moveToTrash(pageId);
        toast(t['com.affine.toastMessage.successfullyDeleted']());
      }
      // Drag page into Collections
      processCollectionsDrag(e);
    },
    [moveToTrash, t]
  );

  const [appSetting] = useAppSetting();
  const location = useLocation();
  const { pageId } = useParams();
  const pageMeta = useBlockSuitePageMeta(
    currentWorkspace.blockSuiteWorkspace
  ).find(meta => meta.id === pageId);
  const inTrashPage = pageMeta?.trash ?? false;
  const setMainContainer = useSetAtom(mainContainerAtom);

  return (
    <>
      {/* This DndContext is used for drag page from all-pages list into a folder in sidebar */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragEnd={handleDragEnd}
      >
        <AppContainer resizing={resizing}>
          <Suspense fallback={<AppSidebarFallback />}>
            <RootAppSidebar
              isPublicWorkspace={false}
              onOpenQuickSearchModal={handleOpenQuickSearchModal}
              onOpenSettingModal={handleOpenSettingModal}
              currentWorkspace={currentWorkspace}
              openPage={useCallback(
                (pageId: string) => {
                  assertExists(currentWorkspace);
                  return openPage(currentWorkspace.id, pageId);
                },
                [currentWorkspace, openPage]
              )}
              createPage={handleCreatePage}
              currentPath={location.pathname.split('?')[0]}
              paths={pathGenerator}
            />
          </Suspense>
          <Suspense fallback={<MainContainer ref={setMainContainer} />}>
            <MainContainer
              ref={setMainContainer}
              padding={appSetting.clientBorder}
              inTrashPage={inTrashPage}
            >
              {incompatible ? <MigrationFallback /> : children}
              <ToolContainer inTrashPage={inTrashPage}>
                <BlockHubWrapper blockHubAtom={rootBlockHubAtom} />
                <HelpIsland showList={pageId ? undefined : showList} />
              </ToolContainer>
            </MainContainer>
          </Suspense>
        </AppContainer>
        <PageListTitleCellDragOverlay />
      </DndContext>
      <QuickSearch />
    </>
  );
};

function PageListTitleCellDragOverlay() {
  const { active } = useDndContext();

  const renderChildren = useCallback(
    ({ icon, pageTitle }: DraggableTitleCellData) => {
      return (
        <StyledTitleLink>
          {icon}
          <Content ellipsis={true} color="inherit">
            {pageTitle}
          </Content>
        </StyledTitleLink>
      );
    },
    []
  );

  return (
    <DragOverlay
      style={{
        zIndex: 1001,
        backgroundColor: 'var(--affine-black-10)',
        padding: '0 30px',
        cursor: 'default',
        borderRadius: 10,
        ...displayFlex('flex-start', 'center'),
      }}
      dropAnimation={null}
    >
      {active
        ? renderChildren(active.data.current as DraggableTitleCellData)
        : null}
    </DragOverlay>
  );
}
